import { describe, expect, it, vi } from 'vitest';
import { appsScriptCode, GoogleSheetsSink, SHEET_HEADERS } from '../src/core/sinks/sheets-sink';
import type { FetchFn } from '../src/core/sinks/types';
import type { Application } from '../src/core/types';

const URL = 'https://script.google.com/macros/s/AKfy-abc_123/exec';
const SECRET = 'aa-secret';

const app = (overrides: Partial<Application> = {}): Application => ({
  id: 'a1',
  company: 'Acme',
  role: 'Full Stack Developer',
  url: 'https://jobs.lever.co/acme/1',
  appliedAt: '2026-11-03T18:00:00.000Z',
  status: 'applied',
  notes: '',
  ...overrides,
});

/* ---------- A tiny fake of Google Sheets, to run the real Apps Script code ---------- */
function fakeGoogle(initialRows: unknown[][] = []) {
  const rows: unknown[][] = initialRows.map((r) => [...r]);
  const range = (row: number, col: number, numRows = 1, numCols = 1): Record<string, unknown> => ({
    setFontWeight: () => undefined,
    setDataValidation: () => undefined,
    setValue: (v: unknown) => {
      rows[row - 1][col - 1] = v;
      return range(row, col);
    },
    getValues: () => rows.slice(row - 1, row - 1 + numRows).map((r) => Array.from({ length: numCols }, (_, i) => r[col - 1 + i] ?? '')),
    createTextFinder: (text: string) => ({
      matchEntireCell: () => ({
        findNext: () => {
          for (let r = row; r < row + numRows; r++) if (String(rows[r - 1]?.[col - 1]) === text) return { getRow: () => r };
          return null;
        },
      }),
    }),
    numCols,
  });
  const sheet = {
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map((r) => r.length)),
    getMaxRows: () => 1000,
    appendRow: (values: unknown[]) => void rows.push([...values]),
    deleteRow: (n: number) => void rows.splice(n - 1, 1),
    getRange: range,
    setFrozenRows: () => undefined,
  };
  const book = { getSheetByName: () => sheet, insertSheet: () => sheet, getUrl: () => 'https://docs.google.com/spreadsheets/d/x' };
  const globals = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => book,
      newDataValidation: () => ({ requireValueInList: () => ({ setAllowInvalid: () => ({ build: () => ({}) }) }) }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    ContentService: { createTextOutput: (text: string) => ({ setMimeType: () => text }), MimeType: { JSON: 'json' } },
  };
  const doPost = new Function(...Object.keys(globals), `${appsScriptCode(SECRET)}; return doPost;`)(
    ...Object.values(globals),
  ) as (e: { postData: { contents: string } }) => string;

  /** fetch that sends the request to the script, like Google would. */
  const fetchFn = vi.fn<FetchFn>(async (_url, init) => new Response(doPost({ postData: { contents: init!.body as string } })));
  /** Column index by the header in the sheet (row 1), like the script does. */
  const col = (name: string) => (rows[0] as string[]).indexOf(name);
  return { rows, fetchFn, col };
}

describe('GoogleSheetsSink + Apps Script', () => {
  it('creates the header and appends one row per application', async () => {
    const g = fakeGoogle();
    const sink = new GoogleSheetsSink({ enabled: true, url: URL, secret: SECRET }, g.fetchFn);

    expect((await sink.save(app())).ok).toBe(true);
    expect((await sink.save(app({ id: 'a2', company: '', url: 'https://example.com/job/7' }))).ok).toBe(true);

    expect(g.rows[0]).toEqual([...SHEET_HEADERS]);
    expect(g.rows).toHaveLength(3);
    expect(g.rows[1]).toEqual(['2026-11-03', 'Acme', 'Full Stack Developer', '', 'applied', 'https://jobs.lever.co/acme/1', '', '', 'a1']);
    expect(g.rows[2][g.col('Company')]).toBe(''); // company is optional
  });

  it('does not duplicate a row when the same application is sent again', async () => {
    const g = fakeGoogle();
    const sink = new GoogleSheetsSink({ enabled: true, url: URL, secret: SECRET }, g.fetchFn);
    await sink.save(app());
    await sink.save(app());
    expect(g.rows).toHaveLength(2);
  });

  it('keeps the Status you edited in the sheet when other fields change', async () => {
    const g = fakeGoogle();
    const sink = new GoogleSheetsSink({ enabled: true, url: URL, secret: SECRET }, g.fetchFn);
    await sink.save(app());

    g.rows[1][g.col('Status')] = 'interview'; // you edit the sheet
    await sink.update(app({ notes: 'Call on Friday' }), ['notes']); // you edit notes in the extension

    expect(g.rows[1][g.col('Status')]).toBe('interview');
    expect(g.rows[1][g.col('Notes')]).toBe('Call on Friday');
  });

  it('updates Status only when you change it in the extension', async () => {
    const g = fakeGoogle();
    const sink = new GoogleSheetsSink({ enabled: true, url: URL, secret: SECRET }, g.fetchFn);
    await sink.save(app());
    await sink.update(app({ status: 'offer' }), ['status']);
    expect(g.rows[1][g.col('Status')]).toBe('offer');
  });

  it('deletes the row', async () => {
    const g = fakeGoogle();
    const sink = new GoogleSheetsSink({ enabled: true, url: URL, secret: SECRET }, g.fetchFn);
    await sink.save(app());
    await sink.save(app({ id: 'a2' }));
    await sink.remove(app());
    expect(g.rows).toHaveLength(2);
    expect(g.rows[1][g.col('Id')]).toBe('a2');
  });

  it('rejects a wrong secret', async () => {
    const g = fakeGoogle();
    const result = await new GoogleSheetsSink({ enabled: true, url: URL, secret: 'wrong' }, g.fetchFn).save(app());
    expect(result).toMatchObject({ ok: false, error: 'Wrong secret. Copy the script again from Sabi.' });
    expect(g.rows).toHaveLength(0);
  });

  it('explains bad URLs and bad deployments', async () => {
    const bad = await new GoogleSheetsSink({ enabled: true, url: 'https://docs.google.com/x', secret: SECRET }, vi.fn()).save(app());
    expect(bad.error).toContain('/exec');

    const html = vi.fn<FetchFn>().mockResolvedValue(new Response('<html>Sign in</html>'));
    const deploy = await new GoogleSheetsSink({ enabled: true, url: URL, secret: SECRET }, html).save(app());
    expect(deploy.error).toContain('"Anyone"');
  });

  it('saves the role you applied as in the Profile column', async () => {
    const g = fakeGoogle();
    const sink = new GoogleSheetsSink({ enabled: true, url: URL, secret: SECRET }, g.fetchFn);
    await sink.save(app({ profile: 'Frontend Developer' }));
    expect(g.rows[1][g.col('Profile')]).toBe('Frontend Developer');
  });

  it('works with an old sheet: adds the Profile column and finds rows by header', async () => {
    // A sheet created before roles existed, with a column the user moved (Status first)
    const old = [
      ['Status', 'Date', 'Company', 'Role', 'URL', 'Notes', 'ClickUp', 'Id'],
      ['interview', '2026-11-01', 'Old Co', 'Dev', 'https://old.co', '', '', 'old-1'],
    ];
    const g = fakeGoogle(old);
    const sink = new GoogleSheetsSink({ enabled: true, url: URL, secret: SECRET }, g.fetchFn);

    await sink.save(app({ profile: 'Backend Developer' }));
    await sink.update(app({ id: 'old-1', notes: 'Call Friday' }), ['notes']);

    expect(g.rows[0]).toEqual([...old[0], 'Profile']); // added at the end, nothing moved
    expect(g.rows[2][g.col('Profile')]).toBe('Backend Developer');
    expect(g.rows[2][g.col('Status')]).toBe('applied');
    expect(g.rows[1][g.col('Notes')]).toBe('Call Friday'); // found the old row by its Id column
    expect(g.rows[1][g.col('Status')]).toBe('interview'); // your status is kept
  });
});
