import type { Application } from '../types';
import { ClickUpSink } from './clickup-sink';
import { ExcelSink, isValidFileName, type FileWriter } from './excel-sink';
import { LocalSink, type ApplicationRepository } from './local-sink';
import { GoogleSheetsSink } from './sheets-sink';
import { errorMessage, type ApplicationSink, type FetchFn, type Settings, type SinkId, type SinkResult } from './types';
import { WebhookSink } from './webhook-sink';

/** What the adapters need from the outside. Injected, so tests can use fakes. */
export interface SinkDeps {
  repo: ApplicationRepository;
  fetchFn?: FetchFn;
  fileWriter?: FileWriter;
}

/**
 * Factory: builds the list of active adapters from the settings.
 * To add a new destination (Notion, Airtable, Google Sheets API…):
 *   1. create a class that implements ApplicationSink
 *   2. add its settings to Settings
 *   3. add one line here
 * Nothing else changes: the popup and the dispatcher stay the same (Open/Closed principle).
 */
export function createSinks(settings: Settings, deps: SinkDeps): ApplicationSink[] {
  const sinks: ApplicationSink[] = [new LocalSink(deps.repo)];
  const { sheets, clickup, webhook, excel } = settings.sinks;
  if (sheets.enabled) sinks.push(new GoogleSheetsSink(sheets, deps.fetchFn));
  if (clickup.enabled) sinks.push(new ClickUpSink(clickup, deps.fetchFn));
  if (webhook.enabled) sinks.push(new WebhookSink(webhook, deps.fetchFn));
  if (excel.enabled && deps.fileWriter) sinks.push(new ExcelSink(excel, deps.repo, deps.fileWriter));
  return sinks;
}

export interface IntegrationStatus {
  id: Exclude<SinkId, 'local'>;
  label: string;
  enabled: boolean;
  /** All the required fields are filled. */
  configured: boolean;
}

/** For the UI: which apps are on and ready. Used by the Integrations tab and the popup. */
export function integrationStatus(settings: Settings): IntegrationStatus[] {
  const { sheets, clickup, excel, webhook } = settings.sinks;
  return [
    { id: 'sheets', label: 'Google Sheets', enabled: sheets.enabled, configured: /^https:\/\/script\.google\.com\/.+\/exec$/.test(sheets.url) },
    { id: 'clickup', label: 'ClickUp', enabled: clickup.enabled, configured: Boolean(clickup.token && clickup.listId) },
    { id: 'excel', label: 'Excel', enabled: excel.enabled, configured: isValidFileName(excel.fileName) },
    { id: 'webhook', label: 'Webhook', enabled: webhook.enabled, configured: /^https:\/\//.test(webhook.url) },
  ];
}

/**
 * Save in every active destination.
 * 1. Local goes first. If it fails (for example a duplicate), we stop, so we don't
 *    create a ClickUp task for a job that is already in the history.
 * 2. 'external' adapters run in parallel. If one fails, the others still save.
 * 3. External ids (like the ClickUp task link) are saved back in the local record.
 * 4. 'final' adapters (Excel) run last, so they see the complete record.
 */
export async function saveApplication(
  application: Application,
  sinks: ApplicationSink[],
  repo: ApplicationRepository,
): Promise<SinkResult[]> {
  const [local, ...others] = sinks;
  const localResult = await safeSave(local, application);
  if (!localResult.ok) return [localResult];

  const external = others.filter((s) => s.phase !== 'final');
  const final = others.filter((s) => s.phase === 'final');

  const externalResults = await Promise.all(external.map((sink) => safeSave(sink, application)));
  await saveLinks(application.id, externalResults, repo);
  const finalResults = await Promise.all(final.map((sink) => safeSave(sink, application)));

  return [localResult, ...externalResults, ...finalResults];
}

/**
 * The application changed in the history (status, notes) or was deleted.
 * Only adapters that implement update() / remove() are called (Sheets, Excel).
 */
export async function notifyChange(
  change: 'update' | 'remove',
  application: Application,
  sinks: ApplicationSink[],
  changed: (keyof Application)[] = [],
): Promise<SinkResult[]> {
  const targets = sinks.filter((s) => typeof s[change] === 'function');
  return Promise.all(
    targets.map(async (sink) => {
      try {
        return change === 'update' ? await sink.update!(application, changed) : await sink.remove!(application);
      } catch (error) {
        return { sinkId: sink.id, ok: false, error: errorMessage(error) };
      }
    }),
  );
}

async function saveLinks(applicationId: string, results: SinkResult[], repo: ApplicationRepository) {
  const links = Object.fromEntries(
    results.filter((r) => r.ok && r.externalId).map((r) => [r.sinkId, { id: r.externalId!, url: r.url ?? '' }]),
  );
  if (!Object.keys(links).length) return;
  const all = await repo.list();
  const saved = all.find((a) => a.id === applicationId);
  if (saved) {
    saved.external = { ...saved.external, ...links };
    await repo.saveAll(all);
  }
}

/** An adapter should return a result, but if one throws, we don't break the others. */
async function safeSave(sink: ApplicationSink, application: Application): Promise<SinkResult> {
  try {
    return await sink.save(application);
  } catch (error) {
    return { sinkId: sink.id, ok: false, error: errorMessage(error) };
  }
}
