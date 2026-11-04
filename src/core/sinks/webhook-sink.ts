import { hmacSha256 } from '../sanitize';
import type { Application } from '../types';
import { errorMessage, type ApplicationSink, type FetchFn, type SinkResult, type WebhookSettings } from './types';

/** The JSON we send. Keep it stable: scripts on the other side depend on it. */
export interface WebhookPayload {
  event: 'application.created';
  version: 1;
  application: Application;
}

/**
 * Generic adapter: POST the application as JSON to any URL.
 * With this one adapter you can save to Google Sheets (Apps Script),
 * Excel Online (Power Automate), Notion or Airtable (Zapier / Make / n8n)…
 */
export class WebhookSink implements ApplicationSink {
  readonly id = 'webhook' as const;
  readonly label = 'Webhook';

  constructor(
    private readonly config: WebhookSettings,
    private readonly fetchFn: FetchFn = (...args) => fetch(...args),
  ) {}

  async save(application: Application): Promise<SinkResult> {
    return this.post({ event: 'application.created', version: 1, application });
  }

  async testConnection(): Promise<SinkResult> {
    const sample: Application = {
      id: 'test',
      company: 'AutoApply test',
      role: 'Test row (you can delete it)',
      url: '',
      appliedAt: new Date().toISOString(),
      status: 'applied',
      notes: '',
    };
    return this.post({ event: 'application.created', version: 1, application: sample });
  }

  private async post(payload: WebhookPayload): Promise<SinkResult> {
    try {
      if (!/^https:\/\//.test(this.config.url)) throw new Error('The webhook URL must start with https://');
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // Security fix #8: sign "timestamp.body" so the receiver can verify the sender and reject replays.
      if (this.config.secret) {
        const timestamp = String(Math.floor(Date.now() / 1000));
        headers['X-AutoApply-Timestamp'] = timestamp;
        headers['X-AutoApply-Signature'] = `sha256=${await hmacSha256(this.config.secret, `${timestamp}.${body}`)}`;
      }
      const response = await this.fetchFn(this.config.url, { method: 'POST', headers, body });
      if (!response.ok) throw new Error(`Webhook answered ${response.status} ${response.statusText}`);
      return { sinkId: this.id, ok: true };
    } catch (error) {
      return { sinkId: this.id, ok: false, error: errorMessage(error) };
    }
  }
}
