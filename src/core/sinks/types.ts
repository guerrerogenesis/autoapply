import type { Application } from '../types';

/** Every place where an application can be saved. Add a new id when you add an adapter. */
export type SinkId = 'local' | 'clickup' | 'webhook' | 'excel' | 'sheets';

export interface SinkResult {
  sinkId: SinkId;
  ok: boolean;
  /** Id and link of the record in the external service (e.g. the ClickUp task). */
  externalId?: string;
  url?: string;
  error?: string;
}

/**
 * The target interface of the Adapter pattern.
 * The popup only knows this interface; it never knows about ClickUp, webhooks or storage.
 * Each adapter translates an Application to the format of its service.
 */
export interface ApplicationSink {
  readonly id: SinkId;
  readonly label: string;
  /**
   * 'external' (default): runs in parallel right after the local save.
   * 'final': runs after the external ones, when their links (e.g. the ClickUp task URL)
   * are already saved. Useful for sinks that write the whole history, like Excel.
   */
  readonly phase?: 'external' | 'final';
  save(application: Application): Promise<SinkResult>;
  /**
   * Optional: the application changed in the history.
   * `changed` lists the fields you edited, so adapters can update only those
   * and keep what you edited in the destination (e.g. Status in the sheet).
   */
  update?(application: Application, changed: (keyof Application)[]): Promise<SinkResult>;
  /** Optional: the application was deleted from the history. */
  remove?(application: Application): Promise<SinkResult>;
  /** Optional: check the config (token, list…) from the Integrations page. */
  testConnection?(): Promise<SinkResult>;
}

/* ---------- Settings for each adapter (saved in chrome.storage.local) ---------- */

export interface ClickUpSettings {
  enabled: boolean;
  /** Personal API token from ClickUp → Settings → Apps. Starts with "pk_". */
  token: string;
  /** The id of the List where tasks are created (from the list URL). */
  listId: string;
  /** Optional: ClickUp status name for new tasks. Empty = the list default. */
  status: string;
}

export interface WebhookSettings {
  enabled: boolean;
  /** Any URL that accepts a JSON POST: Google Apps Script, Power Automate, Zapier, Make, n8n… */
  url: string;
  /** Used to sign each request (HMAC-SHA256), so the receiver can check it comes from you. */
  secret: string;
}

export interface ExcelSettings {
  enabled: boolean;
  /** Path inside your Downloads folder, e.g. "AutoApply/applications.xlsx". */
  fileName: string;
}

export interface GoogleSheetsSettings {
  enabled: boolean;
  /** Web app URL of the Apps Script: https://script.google.com/macros/s/…/exec */
  url: string;
  /** Shared secret: the script only accepts requests that send it. */
  secret: string;
}

export interface Settings {
  sinks: {
    sheets: GoogleSheetsSettings;
    clickup: ClickUpSettings;
    webhook: WebhookSettings;
    excel: ExcelSettings;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  sinks: {
    sheets: { enabled: false, url: '', secret: '' },
    clickup: { enabled: false, token: '', listId: '', status: '' },
    webhook: { enabled: false, url: '', secret: '' },
    excel: { enabled: false, fileName: 'AutoApply/applications.xlsx' },
  },
};

/** Deep merge with defaults, so old saved settings still work after we add new fields. */
export function withDefaults(saved: Partial<Settings> | undefined): Settings {
  return {
    sinks: {
      sheets: { ...DEFAULT_SETTINGS.sinks.sheets, ...saved?.sinks?.sheets },
      clickup: { ...DEFAULT_SETTINGS.sinks.clickup, ...saved?.sinks?.clickup },
      webhook: { ...DEFAULT_SETTINGS.sinks.webhook, ...saved?.sinks?.webhook },
      excel: { ...DEFAULT_SETTINGS.sinks.excel, ...saved?.sinks?.excel },
    },
  };
}

/** fetch is injected so adapters can be tested without network. */
export type FetchFn = typeof fetch;

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
