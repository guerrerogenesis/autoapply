import type { Application } from '../types';
import type { ApplicationSink, SinkResult } from './types';

/** Minimal storage contract, so this adapter can be tested with an in-memory list. */
export interface ApplicationRepository {
  list(): Promise<Application[]>;
  saveAll(applications: Application[]): Promise<void>;
}

/**
 * Saves in chrome.storage.local. This is the source of truth:
 * the history page and CSV export read from here, and it is always enabled.
 */
export class LocalSink implements ApplicationSink {
  readonly id = 'local' as const;
  readonly label = 'This browser';

  constructor(private readonly repo: ApplicationRepository) {}

  async save(application: Application): Promise<SinkResult> {
    const all = await this.repo.list();
    if (all.some((a) => a.url && a.url === application.url)) {
      return { sinkId: this.id, ok: false, error: 'This job is already in your history.' };
    }
    await this.repo.saveAll([application, ...all]);
    return { sinkId: this.id, ok: true, externalId: application.id };
  }
}
