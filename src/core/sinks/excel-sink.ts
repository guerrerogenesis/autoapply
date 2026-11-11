import type { Application } from '../types';
import { buildXlsx, type SheetOptions } from '../xlsx';
import type { ApplicationRepository } from './local-sink';
import { errorMessage, type ApplicationSink, type ExcelSettings, type SinkResult } from './types';

/**
 * Where the file is written. In the extension it is chrome.downloads (see storage.ts);
 * in tests it is a fake. The adapter does not care.
 */
export interface FileWriter {
  write(fileName: string, bytes: Uint8Array): Promise<void>;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Pure mapping from the history to a sheet. Also used by "Export Excel" in the options page. */
export function applicationsSheet(applications: Application[]): SheetOptions {
  return {
    name: 'Applications',
    columns: [
      { header: 'Date', width: 12 },
      { header: 'Company', width: 24 },
      { header: 'Role', width: 30 },
      { header: 'Profile', width: 20 },
      { header: 'Status', width: 12 },
      { header: 'URL', width: 50 },
      { header: 'Notes', width: 40 },
      { header: 'ClickUp', width: 36 },
    ], // same order as the Google Sheet
    rows: applications.map((a) => [
      new Date(a.appliedAt.slice(0, 10)),
      a.company,
      a.role,
      a.profile ?? '',
      a.status,
      a.url,
      a.notes,
      a.external?.clickup?.url ?? '',
    ]),
  };
}

/** "Sabi/applications.xlsx" -> valid; "../x.xlsx" or "C:\\x.xlsx" -> invalid. */
export function isValidFileName(name: string): boolean {
  return /\.xlsx$/i.test(name) && !name.includes('..') && !/^([a-z]:|[\\/])/i.test(name) && !/[<>:"|?*]/.test(name);
}

/**
 * Adapter: keeps an Excel file with your whole history.
 * A browser cannot add one row to an existing file, so we rebuild the whole
 * workbook from the local history (the source of truth) and overwrite the file.
 */
export class ExcelSink implements ApplicationSink {
  readonly id = 'excel' as const;
  readonly label = 'Excel';
  /** Runs after ClickUp, so the file already has the new task link. */
  readonly phase = 'final' as const;

  constructor(
    private readonly config: ExcelSettings,
    private readonly repo: ApplicationRepository,
    private readonly writer: FileWriter,
  ) {}

  async save(_application: Application): Promise<SinkResult> {
    // The dispatcher runs LocalSink first, so the new application is already in the repo.
    return this.sync();
  }

  /** Status or notes changed, or a row was deleted: rewrite the file. */
  async update(): Promise<SinkResult> {
    return this.sync();
  }

  async remove(): Promise<SinkResult> {
    return this.sync();
  }

  async testConnection(): Promise<SinkResult> {
    return this.sync();
  }

  /** Rewrite the file with the current history. Also called by "Update Excel now". */
  async sync(): Promise<SinkResult> {
    try {
      if (!isValidFileName(this.config.fileName)) {
        throw new Error('Use a file name like Sabi/applications.xlsx');
      }
      const bytes = buildXlsx(applicationsSheet(await this.repo.list()));
      await this.writer.write(this.config.fileName, bytes);
      return { sinkId: this.id, ok: true };
    } catch (error) {
      return { sinkId: this.id, ok: false, error: errorMessage(error) };
    }
  }
}
