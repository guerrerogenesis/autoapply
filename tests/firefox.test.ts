// @vitest-environment jsdom
/**
 * Firefox compatibility: fallbacks for APIs that only Chrome has.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { topOrigin } from '../src/content/content';

type FakeWin = { top: unknown; location: { origin: string; ancestorOrigins?: string[] } };

describe('topOrigin (frames)', () => {
  it('top page: its own origin', () => {
    const win: FakeWin = { top: null, location: { origin: 'https://acme.com' } };
    win.top = win;
    expect(topOrigin(win as unknown as Window)).toBe('https://acme.com');
  });

  it('same-origin parent: read directly (works in Firefox without ancestorOrigins)', () => {
    const top = { location: { origin: 'https://acme.com' } };
    const win: FakeWin = { top, location: { origin: 'https://acme.com' } };
    expect(topOrigin(win as unknown as Window)).toBe('https://acme.com');
  });

  it('cross-origin parent: uses ancestorOrigins when the browser has it', () => {
    const top = { get location(): never { throw new DOMException('cross-origin'); } };
    const win: FakeWin = { top, location: { origin: 'https://boards.greenhouse.io', ancestorOrigins: ['https://acme.com'] } };
    expect(topOrigin(win as unknown as Window)).toBe('https://acme.com');
  });

  it('cross-origin parent and no ancestorOrigins (older Firefox): unknown = treated as third-party', () => {
    const top = { get location(): never { throw new DOMException('cross-origin'); } };
    const win: FakeWin = { top, location: { origin: 'https://ads.example' } };
    expect(topOrigin(win as unknown as Window)).toBe('unknown');
  });
});

describe('Excel download in Firefox', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('falls back to a blob: URL when data: URLs are refused, and frees it after', async () => {
    const calls: string[] = [];
    const listeners: ((d: unknown) => void)[] = [];
    vi.stubGlobal('chrome', {
      downloads: {
        download: vi.fn(async ({ url }: { url: string }) => {
          calls.push(url.slice(0, 5));
          if (url.startsWith('data:')) throw new Error('Type error: data: URLs are not allowed');
          return 7;
        }),
        search: vi.fn(async () => [{ id: 7, state: 'complete' }]),
        onChanged: { addListener: (l: (d: unknown) => void) => listeners.push(l), removeListener: vi.fn() },
      },
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const { downloadsWriter } = await import('../src/core/downloads-writer');

    await downloadsWriter.write('Sabi/applications.xlsx', new Uint8Array([1, 2, 3]));

    expect(calls).toEqual(['data:', 'blob:']);
    expect(revoke).toHaveBeenCalledOnce();
  });
});

describe('manifests', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

  it('the shared manifest uses options_ui (works in Chrome and Firefox)', () => {
    const manifest = JSON.parse(read('public/manifest.json'));
    expect(manifest.options_ui).toEqual({ page: 'options.html', open_in_tab: true });
    expect(manifest.options_page).toBeUndefined();
  });

  it('the Firefox build adds background scripts, an add-on ID and the data declaration', () => {
    const build = read('scripts/build.mjs');
    expect(build).toMatch(/scripts: \[service_worker\]/);
    expect(build).toMatch(/id: 'sabi@geneg\.com\.mx'/);
    expect(build).toMatch(/data_collection_permissions: \{ required: \['none'\] \}/);
  });

  it('no innerHTML in extension pages (Mozilla review)', () => {
    for (const file of ['src/options/options.ts', 'src/options/roles-ui.ts', 'src/popup/popup.ts']) {
      expect(read(file).replace(/\/\*\*.*?\*\//gs, ''), file).not.toMatch(/\.innerHTML\s*=/);
    }
  });
});
