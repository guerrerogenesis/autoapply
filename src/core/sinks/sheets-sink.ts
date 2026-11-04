import { neutralizeFormula } from '../sanitize';
import type { Application, ApplicationStatus } from '../types';
import { errorMessage, type ApplicationSink, type FetchFn, type GoogleSheetsSettings, type SinkResult } from './types';

/** Columns of the sheet. The Apps Script below uses the same list. Id is last: it is only used to find the row. */
export const SHEET_HEADERS = ['Date', 'Company', 'Role', 'Status', 'URL', 'Notes', 'ClickUp', 'Id'] as const;
export type SheetHeader = (typeof SHEET_HEADERS)[number];

export const STATUS_OPTIONS: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'ghosted'];

/** Every text value is neutralized, so the sheet never runs it as a formula (security fix #5). */
export function toRow(a: Application): Record<SheetHeader, string> {
  const row: Record<SheetHeader, string> = {
    Date: a.appliedAt.slice(0, 10),
    Company: a.company,
    Role: a.role,
    Status: a.status,
    URL: a.url,
    Notes: a.notes,
    ClickUp: a.external?.clickup?.url ?? '',
    Id: a.id,
  };
  for (const key of SHEET_HEADERS) row[key] = neutralizeFormula(row[key]);
  return row;
}

/** Which sheet column each Application field lives in. */
const FIELD_TO_HEADER: Partial<Record<keyof Application, SheetHeader>> = {
  company: 'Company',
  role: 'Role',
  status: 'Status',
  url: 'URL',
  notes: 'Notes',
};

interface SheetsRequest {
  secret: string;
  action: 'create' | 'update' | 'delete' | 'ping';
  id?: string;
  /** create: the full row. update: only the columns that changed. */
  values?: Partial<Record<SheetHeader, string>>;
}

interface SheetsResponse {
  ok: boolean;
  error?: string;
  row?: number;
  sheetUrl?: string;
}

/**
 * Adapter for Google Sheets, through a small Apps Script web app in your own sheet.
 * - New application -> appends ONE row (Date, Company, Role, Status, URL…).
 * - The sheet is where you track: edit Status there freely.
 * - If you change a field in the extension, only that cell is updated. Nothing else is overwritten.
 * - Deleted in the extension -> the row is deleted.
 * No Google Cloud project or OAuth needed: the script runs as you, inside your sheet.
 */
export class GoogleSheetsSink implements ApplicationSink {
  readonly id = 'sheets' as const;
  readonly label = 'Google Sheets';
  /** Runs after ClickUp, so the row already has the task link. */
  readonly phase = 'final' as const;

  constructor(
    private readonly config: GoogleSheetsSettings,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  save(application: Application) {
    return this.send({ secret: this.config.secret, action: 'create', id: application.id, values: toRow(application) });
  }

  update(application: Application, changed: (keyof Application)[]) {
    const row = toRow(application);
    const values = Object.fromEntries(
      changed.map((field) => FIELD_TO_HEADER[field]).filter(Boolean).map((header) => [header!, row[header!]]),
    );
    if (!Object.keys(values).length) return Promise.resolve<SinkResult>({ sinkId: this.id, ok: true });
    return this.send({ secret: this.config.secret, action: 'update', id: application.id, values });
  }

  remove(application: Application) {
    return this.send({ secret: this.config.secret, action: 'delete', id: application.id });
  }

  testConnection() {
    return this.send({ secret: this.config.secret, action: 'ping' });
  }

  private async send(request: SheetsRequest): Promise<SinkResult> {
    try {
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(this.config.url)) {
        throw new Error('Paste the Web app URL from Apps Script (it ends with /exec).');
      }
      // text/plain avoids a CORS preflight, which Apps Script does not answer.
      const response = await this.fetchFn(this.config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(request),
      });
      const text = await response.text();
      let data: SheetsResponse;
      try {
        data = JSON.parse(text) as SheetsResponse;
      } catch {
        // Apps Script returns an HTML page when the deployment is wrong (not "Anyone", not authorized…)
        throw new Error('The script did not answer JSON. Check that the deployment access is "Anyone".');
      }
      if (!response.ok || !data.ok) throw new Error(data.error ?? `Google answered ${response.status}`);
      return { sinkId: this.id, ok: true, url: data.sheetUrl };
    } catch (error) {
      return { sinkId: this.id, ok: false, error: errorMessage(error) };
    }
  }
}

export { newSecret } from '../sanitize';

/** The Apps Script to paste in the sheet (Extensions → Apps Script). Shown in the Integrations page. */
export function appsScriptCode(secret: string): string {
  return `/**
 * @OnlyCurrentDoc
 * (Google only gives this script access to THIS spreadsheet, not to all your files.)
 */
// AutoApply → Google Sheets
// Paste this in your sheet: Extensions → Apps Script. Then Deploy → New deployment → Web app.
const SECRET = '${secret}';
const SHEET_NAME = 'Applications';
const HEADERS = ${JSON.stringify(SHEET_HEADERS)};
const STATUSES = ${JSON.stringify(STATUS_OPTIONS)};

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) return json_({ ok: false, error: 'Wrong secret. Copy the script again from AutoApply.' });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // two saves at the same time will not write the same row
  try {
    const sheet = sheet_();
    if (body.action === 'ping') return json_({ ok: true, sheetUrl: url_() });

    const row = findRow_(sheet, body.id);

    if (body.action === 'delete') {
      if (row) sheet.deleteRow(row);
      return json_({ ok: true });
    }

    if (body.action === 'update') {
      if (!row) return json_({ ok: false, error: 'Row not found in the sheet.' });
      // Only the columns that changed. What you edited in the sheet stays.
      Object.keys(body.values).forEach(function (header) {
        const col = HEADERS.indexOf(header) + 1;
        if (col > 0) sheet.getRange(row, col).setValue(safe_(body.values[header]));
      });
      return json_({ ok: true, row: row, sheetUrl: url_() });
    }

    // create: append one row. If it already exists, do not touch it.
    if (row) return json_({ ok: true, row: row, sheetUrl: url_() });
    sheet.appendRow(HEADERS.map(function (h) { return safe_(body.values[h]); }));
    return json_({ ok: true, row: sheet.getLastRow(), sheetUrl: url_() });
  } finally {
    lock.releaseLock();
  }
}

function sheet_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = book.getSheetByName(SHEET_NAME) || book.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // Status as a dropdown, so tracking is easy
    const status = HEADERS.indexOf('Status') + 1;
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build();
    sheet.getRange(2, status, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
  }
  return sheet;
}

function findRow_(sheet, id) {
  if (!id || sheet.getLastRow() < 2) return 0;
  const idCol = HEADERS.indexOf('Id') + 1;
  const cell = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : 0;
}

// Text that starts with = + - @ would run as a formula. An apostrophe makes it plain text.
function safe_(value) {
  const text = String(value == null ? '' : value).slice(0, 5000);
  return /^[=+\\-@\\t\\r]/.test(text) ? "'" + text : text;
}

function url_() {
  return SpreadsheetApp.getActiveSpreadsheet().getUrl();
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
`;
}
