import type { Application } from '../types';
import { errorMessage, type ApplicationSink, type ClickUpSettings, type FetchFn, type SinkResult } from './types';

const API = 'https://api.clickup.com/api/v2';

/**
 * Accepts the list ID or the list URL you copy from the browser:
 * "901234567" or "https://app.clickup.com/9012/v/li/901234567" -> "901234567"
 */
export function parseListId(input: string): string {
  const text = input.trim();
  const fromUrl = text.match(/\/li\/([\w-]+)/);
  if (fromUrl) return fromUrl[1];
  return /^[\w-]+$/.test(text) ? text : '';
}

/** The body ClickUp expects in POST /list/{list_id}/task (only the fields we use). */
export interface ClickUpTaskPayload {
  name: string;
  description: string;
  tags: string[];
  status?: string;
}

/**
 * Adapter: translates our Application into a ClickUp task.
 * Docs: https://clickup.com/api/clickupreference/operation/CreateTask/
 */
export class ClickUpSink implements ApplicationSink {
  readonly id = 'clickup' as const;
  readonly label = 'ClickUp';

  constructor(
    private readonly config: ClickUpSettings,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  /** Pure mapping, easy to test and to change. */
  static toTask(app: Application, status = ''): ClickUpTaskPayload {
    const lines = [
      `Company: ${app.company}`,
      app.role ? `Role: ${app.role}` : null,
      app.profile ? `Applied as: ${app.profile}` : null,
      `Applied: ${app.appliedAt.slice(0, 10)}`,
      app.url ? `Link: ${app.url}` : null,
      app.notes ? `Notes: ${app.notes}` : null,
      '',
      'Saved with Sabi',
    ].filter((line): line is string => line !== null);

    return {
      name: app.role ? `${app.company} — ${app.role}` : app.company,
      description: lines.join('\n'),
      tags: ['sabi'],
      ...(status ? { status } : {}),
    };
  }

  async save(application: Application): Promise<SinkResult> {
    try {
      const response = await this.request(`/list/${encodeURIComponent(this.config.listId)}/task`, {
        method: 'POST',
        body: JSON.stringify(ClickUpSink.toTask(application, this.config.status)),
      });
      const task = (await response.json()) as { id: string; url?: string };
      return { sinkId: this.id, ok: true, externalId: task.id, url: task.url };
    } catch (error) {
      return { sinkId: this.id, ok: false, error: errorMessage(error) };
    }
  }

  async testConnection(): Promise<SinkResult> {
    try {
      const response = await this.request(`/list/${encodeURIComponent(this.config.listId)}`, { method: 'GET' });
      const list = (await response.json()) as { id: string; name: string };
      return { sinkId: this.id, ok: true, externalId: list.id, url: `List: ${list.name}` };
    } catch (error) {
      return { sinkId: this.id, ok: false, error: errorMessage(error) };
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    if (!this.config.token || !this.config.listId) throw new Error('Add your ClickUp token and List ID.');
    const response = await this.fetchFn(`${API}${path}`, {
      ...init,
      headers: { Authorization: this.config.token, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      // ClickUp sends { err: "...", ECODE: "..." }
      const body = (await response.json().catch(() => ({}))) as { err?: string };
      const hint = response.status === 401 ? ' Check your token.' : response.status === 404 ? ' Check the List ID.' : '';
      throw new Error(`ClickUp ${response.status}: ${body.err ?? response.statusText}.${hint}`);
    }
    return response;
  }
}
