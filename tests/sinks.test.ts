import { describe, expect, it, vi } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { ClickUpSink } from '../src/core/sinks/clickup-sink';
import { ExcelSink, isValidFileName } from '../src/core/sinks/excel-sink';
import type { ApplicationRepository } from '../src/core/sinks/local-sink';
import { createSinks, saveApplication } from '../src/core/sinks/registry';
import { DEFAULT_SETTINGS, withDefaults, type ApplicationSink, type FetchFn, type Settings } from '../src/core/sinks/types';
import { WebhookSink } from '../src/core/sinks/webhook-sink';
import type { Application } from '../src/core/types';

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

/** In-memory repository: the LocalSink does not know it is not chrome.storage. */
function memoryRepo(initial: Application[] = []): ApplicationRepository & { data: Application[] } {
  const repo = {
    data: structuredClone(initial),
    list: async () => structuredClone(repo.data),
    saveAll: async (all: Application[]) => {
      repo.data = structuredClone(all);
    },
  };
  return repo;
}

function fakeWriter() {
  const files: Record<string, Uint8Array> = {};
  return { files, write: vi.fn(async (name: string, bytes: Uint8Array) => void (files[name] = bytes)) };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const settings = (patch: (s: Settings) => void): Settings => {
  const s = structuredClone(DEFAULT_SETTINGS);
  patch(s);
  return s;
};

describe('ClickUpSink (adapter)', () => {
  const config = { enabled: true, token: 'pk_test', listId: '901', status: '' };

  it('maps an application to a ClickUp task', () => {
    const task = ClickUpSink.toTask(app({ notes: 'Referral' }), 'to do');
    expect(task.name).toBe('Acme — Full Stack Developer');
    expect(task.description).toContain('Link: https://jobs.lever.co/acme/1');
    expect(task.description).toContain('Notes: Referral');
    expect(task.tags).toEqual(['sabi']);
    expect(task.status).toBe('to do');
    expect(ClickUpSink.toTask(app()).status).toBeUndefined();
  });

  it('calls the ClickUp API and returns the task link', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(json(200, { id: 'abc', url: 'https://app.clickup.com/t/abc' }));
    const result = await new ClickUpSink(config, fetchFn).save(app());

    expect(result).toEqual({ sinkId: 'clickup', ok: true, externalId: 'abc', url: 'https://app.clickup.com/t/abc' });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.clickup.com/api/v2/list/901/task');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('pk_test');
  });

  it('returns a clear error instead of throwing', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(json(401, { err: 'Token invalid', ECODE: 'OAUTH_025' }));
    const result = await new ClickUpSink(config, fetchFn).save(app());
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ClickUp 401: Token invalid. Check your token.');
  });

  it('does not call the API without token or list', async () => {
    const fetchFn = vi.fn<FetchFn>();
    const result = await new ClickUpSink({ ...config, token: '' }, fetchFn).save(app());
    expect(result.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('WebhookSink (adapter)', () => {
  it('posts a stable JSON payload', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(new Response('ok'));
    const result = await new WebhookSink({ enabled: true, url: 'https://hooks.example.com/x', secret: '' }, fetchFn).save(app());
    expect(result.ok).toBe(true);
    const body = JSON.parse(fetchFn.mock.calls[0][1]!.body as string);
    expect(body).toEqual({ event: 'application.created', version: 1, application: app() });
  });

  it('rejects non https URLs', async () => {
    const fetchFn = vi.fn<FetchFn>();
    const result = await new WebhookSink({ enabled: true, url: 'http://insecure.com', secret: '' }, fetchFn).save(app());
    expect(result.ok).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('createSinks (factory)', () => {
  it('always includes local, and adds the enabled adapters', () => {
    expect(createSinks(DEFAULT_SETTINGS, { repo: memoryRepo() }).map((s) => s.id)).toEqual(['local']);
    const all = settings((s) => {
      s.sinks.clickup.enabled = true;
      s.sinks.webhook.enabled = true;
      s.sinks.excel.enabled = true;
    });
    expect(createSinks(all, { repo: memoryRepo(), fileWriter: fakeWriter() }).map((s) => s.id)).toEqual(['local', 'clickup', 'webhook', 'excel']);
  });

  it('fills missing settings with defaults (old saved data still works)', () => {
    expect(withDefaults({ sinks: { clickup: { enabled: true } } } as never).sinks.clickup).toEqual({
      enabled: true,
      token: '',
      listId: '',
      status: '',
    });
  });
});

describe('saveApplication (dispatcher)', () => {
  const fakeSink = (id: 'clickup' | 'webhook', behavior: () => Promise<unknown>): ApplicationSink => ({
    id,
    label: id,
    save: behavior as ApplicationSink['save'],
  });

  it('saves locally and stores the ClickUp link in the record', async () => {
    const repo = memoryRepo();
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(json(200, { id: 't1', url: 'https://app.clickup.com/t/t1' }));
    const sinks = createSinks(settings((s) => (s.sinks.clickup = { enabled: true, token: 'pk', listId: '1', status: '' })), { repo, fetchFn });

    const results = await saveApplication(app(), sinks, repo);

    expect(results.map((r) => [r.sinkId, r.ok])).toEqual([['local', true], ['clickup', true]]);
    expect(repo.data[0].external).toEqual({ clickup: { id: 't1', url: 'https://app.clickup.com/t/t1' } });
  });

  it('if one external adapter fails, the others still save', async () => {
    const repo = memoryRepo();
    const sinks = createSinks(DEFAULT_SETTINGS, { repo });
    sinks.push(fakeSink('clickup', () => Promise.reject(new Error('Network down'))));
    sinks.push(fakeSink('webhook', async () => ({ sinkId: 'webhook', ok: true })));

    const results = await saveApplication(app(), sinks, repo);

    expect(results).toEqual([
      { sinkId: 'local', ok: true, externalId: 'a1' },
      { sinkId: 'clickup', ok: false, error: 'Network down' },
      { sinkId: 'webhook', ok: true },
    ]);
    expect(repo.data).toHaveLength(1);
  });

  it('does not send duplicates to external services', async () => {
    const repo = memoryRepo([app({ id: 'old' })]);
    const clickup = vi.fn();
    const sinks = [...createSinks(DEFAULT_SETTINGS, { repo }), fakeSink('clickup', clickup)];

    const results = await saveApplication(app(), sinks, repo);

    expect(results).toEqual([{ sinkId: 'local', ok: false, error: 'This job is already in your history.' }]);
    expect(clickup).not.toHaveBeenCalled();
  });
});

describe('ExcelSink (adapter)', () => {
  const config = { enabled: true, fileName: 'Sabi/applications.xlsx' };
  const sheetXml = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['xl/worksheets/sheet1.xml']);

  it('writes the whole history as a real .xlsx', async () => {
    const repo = memoryRepo([app(), app({ id: 'a2', company: 'Pérez & Co <MX>', url: 'x' })]);
    const writer = fakeWriter();
    const result = await new ExcelSink(config, repo, writer).save(app());

    expect(result).toEqual({ sinkId: 'excel', ok: true });
    const bytes = writer.files['Sabi/applications.xlsx'];
    expect(Object.keys(unzipSync(bytes))).toContain('xl/workbook.xml');
    const xml = sheetXml(bytes);
    expect(xml).toContain('<t xml:space="preserve">Company</t>');
    expect(xml).toContain('Pérez &amp; Co &lt;MX&gt;'); // escaped, so the file is not corrupted
    expect(xml.match(/<row /g)).toHaveLength(3); // header + 2 applications
  });

  it('rejects unsafe file names', async () => {
    expect(isValidFileName('Sabi/applications.xlsx')).toBe(true);
    expect(isValidFileName('../secret.xlsx')).toBe(false);
    expect(isValidFileName('C:/x.xlsx')).toBe(false);
    expect(isValidFileName('notes.txt')).toBe(false);
    const result = await new ExcelSink({ enabled: true, fileName: '../x.xlsx' }, memoryRepo(), fakeWriter()).sync();
    expect(result.ok).toBe(false);
  });

  it('returns the error when the file is locked', async () => {
    const writer = { write: vi.fn().mockRejectedValue(new Error('If it is open in Excel, close it')) };
    const result = await new ExcelSink(config, memoryRepo(), writer).sync();
    expect(result).toEqual({ sinkId: 'excel', ok: false, error: 'If it is open in Excel, close it' });
  });

  it('runs after ClickUp, so the file includes the new task link', async () => {
    const repo = memoryRepo();
    const writer = fakeWriter();
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(json(200, { id: 't9', url: 'https://app.clickup.com/t/t9' }));
    const sinks = createSinks(
      settings((s) => {
        s.sinks.clickup = { enabled: true, token: 'pk', listId: '1', status: '' };
        s.sinks.excel.enabled = true;
      }),
      { repo, fetchFn, fileWriter: writer },
    );

    const results = await saveApplication(app(), sinks, repo);

    expect(results.map((r) => r.sinkId)).toEqual(['local', 'clickup', 'excel']);
    expect(sheetXml(writer.files['Sabi/applications.xlsx'])).toContain('https://app.clickup.com/t/t9');
  });
});

describe('integration controls', () => {
  it('accepts a ClickUp list URL or ID', async () => {
    const { parseListId } = await import('../src/core/sinks/clickup-sink');
    expect(parseListId('901234567')).toBe('901234567');
    expect(parseListId('https://app.clickup.com/9012345/v/li/901234567')).toBe('901234567');
    expect(parseListId(' https://app.clickup.com/9012345/v/li/901234567?pr=1 ')).toBe('901234567');
    expect(parseListId('not a list')).toBe('');
  });

  it('reports Off / Needs setup / On for each app', async () => {
    const { integrationStatus } = await import('../src/core/sinks/registry');
    const s = settings((x) => {
      x.sinks.sheets = { enabled: true, url: 'https://script.google.com/macros/s/abc/exec', secret: 's' };
      x.sinks.clickup.enabled = true; // no token yet
    });
    expect(integrationStatus(s).map((i) => [i.id, i.enabled, i.configured])).toEqual([
      ['sheets', true, true],
      ['clickup', true, false],
      ['excel', false, true],
      ['webhook', false, false],
    ]);
  });
});
