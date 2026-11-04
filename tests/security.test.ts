// @vitest-environment jsdom
/**
 * Regression tests for the security audit (see SECURITY.md).
 * Each test is named after the finding it protects.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectAnswers, fillPage, planFill } from '../src/content/dom';
import { isUserVisible } from '../src/content/visibility';
import { parseBackup } from '../src/core/backup';
import { classifyFrame, isKnownAts } from '../src/core/frames';
import { matchField } from '../src/core/matcher';
import { hmacSha256, neutralizeFormula, safeHref } from '../src/core/sanitize';
import { appsScriptCode, toRow } from '../src/core/sinks/sheets-sink';
import { WebhookSink } from '../src/core/sinks/webhook-sink';
import type { FetchFn } from '../src/core/sinks/types';
import { EMPTY_PROFILE, type Application, type Profile, type SavedAnswer } from '../src/core/types';

const profile: Profile = {
  ...EMPTY_PROFILE,
  firstName: 'Ana',
  email: 'ana@example.com',
  phone: '+52 322 000 0000',
  city: 'Puerto Vallarta',
  country: 'Mexico',
  linkedin: 'https://linkedin.com/in/ana',
  github: 'https://github.com/ana',
  yearsExperience: '6',
  salaryExpectation: '3000 USD',
  englishLevel: 'B1',
};
const answers: SavedAnswer[] = [{ id: '1', question: 'Why do you want to work here?', answer: 'PRIVATE answer', updatedAt: '' }];
const trap = readFileSync(resolve(__dirname, 'fixtures/trap-job.html'), 'utf8');
const $ = (id: string) => document.getElementById(id) as HTMLInputElement;

beforeEach(() => {
  document.documentElement.innerHTML = trap.replace(/^<!doctype html>/i, '');
});

describe('#1 hidden fields are never filled', () => {
  it('fills only the 2 visible fields of the trap page', () => {
    const result = fillPage(document, profile, answers, { includeAnswers: true });
    expect($('fn').value).toBe('Ana');
    expect($('em').value).toBe('ana@example.com');
    for (const id of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7']) expect($(id).value, id).toBe('');
    expect(result.hidden).toBeGreaterThanOrEqual(7);
  });

  describe('geometry checks (real browser layout, simulated)', () => {
    const rects: Record<string, Partial<DOMRect>> = {
      g1: { left: -9999, top: 100, width: 200, height: 30 },
      g2: { left: 10, top: 100, width: 1, height: 1 },
      g3: { left: 10, top: 100, width: 200, height: 30 },
      g3parent: { left: 10, top: 100, width: 600, height: 0 },
      ok: { left: 10, top: 100, width: 200, height: 30 },
    };
    beforeEach(() => {
      document.getElementById('g3')!.parentElement!.id = 'g3parent';
      const fake = function (this: Element) {
        const r = this === document.documentElement ? { left: 0, top: 0, width: 1024, height: 2000 } : rects[this.id] ?? rects.ok;
        const full = { x: r.left, y: r.top, right: r.left! + r.width!, bottom: r.top! + r.height!, ...r };
        return { ...full, toJSON: () => full } as DOMRect;
      };
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(fake);
    });
    afterEach(() => vi.restoreAllMocks());

    it('rejects off-screen, 1px and clipped fields', () => {
      expect(isUserVisible($('g1'))).toBe(false);
      expect(isUserVisible($('g2'))).toBe(false);
      expect(isUserVisible($('g3'))).toBe(false);
      expect(isUserVisible($('fn'))).toBe(true);
    });
  });
});

describe('#2 only trusted frames get data', () => {
  it('trusts the top page, same origin and known job platforms', () => {
    expect(classifyFrame(true, 'https://acme.com', 'https://acme.com').trusted).toBe(true);
    expect(classifyFrame(false, 'https://acme.com', 'https://acme.com').reason).toBe('same-origin');
    expect(classifyFrame(false, 'https://boards.greenhouse.io', 'https://acme.com').reason).toBe('known-ats');
  });

  it('blocks ads, widgets and look-alike domains', () => {
    expect(classifyFrame(false, 'https://ads.tracker.net', 'https://acme.com').trusted).toBe(false);
    expect(classifyFrame(false, 'null', 'null').trusted).toBe(false); // sandboxed iframe
    expect(isKnownAts('https://greenhouse.io.evil.com')).toBe(false);
    expect(isKnownAts('https://evilgreenhouse.io')).toBe(false);
    expect(isKnownAts('http://boards.greenhouse.io')).toBe(false); // not https
  });
});

describe('#3 saved answers need your confirmation', () => {
  it('plans answers as not selected', () => {
    document.body.innerHTML = '<label for="q">Why do you want to work here?</label><textarea id="q"></textarea>';
    const plan = planFill(document, profile, answers);
    expect(plan.items).toEqual([expect.objectContaining({ kind: 'answer', selected: false })]);
    fillPage(document, profile, answers);
    expect($('q').value).toBe('');
  });

  it('does not save text the page planted', () => {
    expect(collectAnswers(document)).toEqual([]);
  });
});

describe('#4 the content script does not read storage', () => {
  it('has no reference to chrome.storage', () => {
    for (const file of ['src/content/content.ts', 'src/content/dom.ts', 'src/content/visibility.ts']) {
      expect(readFileSync(resolve(__dirname, '..', file), 'utf8'), file).not.toMatch(/chrome\.storage|from '\.\.\/core\/storage'/);
    }
  });
});

describe('#5 formula injection', () => {
  it('neutralizes values that start like a formula', () => {
    expect(neutralizeFormula('=HYPERLINK("https://evil")')).toBe(`'=HYPERLINK("https://evil")`);
    expect(neutralizeFormula('+52 322')).toBe(`'+52 322`);
    expect(neutralizeFormula('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(neutralizeFormula('Acme')).toBe('Acme');
  });

  it('every Sheets value is neutralized', () => {
    const app: Application = {
      id: 'a1',
      company: '-cmd',
      role: document.title.split(' at ')[0],
      url: 'https://x.com',
      appliedAt: '2026-11-03T00:00:00Z',
      status: 'applied',
      notes: '=IMPORTXML("https://evil","//a")',
    };
    const row = toRow(app);
    expect(row.Role.startsWith("'=")).toBe(true);
    expect(row.Notes.startsWith("'=")).toBe(true);
    expect(row.Company).toBe("'-cmd");
  });

  it('the Apps Script also protects itself and only asks for the current sheet (#7)', () => {
    const code = appsScriptCode('s');
    expect(code).toContain('@OnlyCurrentDoc');
    const safe = new Function(`${code}; return safe_;`)() as (v: string) => string;
    expect(safe('=1+1')).toBe("'=1+1");
    expect(safe('-x')).toBe("'-x");
    expect(safe('Acme')).toBe('Acme');
  });
});

describe('#6 label spoofing', () => {
  it('aria-label wins over fake text before the field', () => {
    fillPage(document, profile, answers);
    expect($('spoof').value).toBe('https://linkedin.com/in/ana');
  });

  it('nearby text is the last option', () => {
    const field = { tag: 'input' as const, type: 'text', name: '', id: '', placeholder: '', autocomplete: '', ariaLabel: '', label: '' };
    expect(matchField({ ...field, ariaLabel: 'GitHub', nearbyText: 'Salary' })).toBe('github');
    expect(matchField({ ...field, nearbyText: 'Salary' })).toBe('salaryExpectation');
  });
});

describe('#8 signed webhooks', () => {
  it('sends an HMAC-SHA256 signature of "timestamp.body"', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(new Response('ok'));
    const app = { id: 'a1', company: 'Acme', role: '', url: '', appliedAt: '2026-11-03T00:00:00Z', status: 'applied' as const, notes: '' };
    await new WebhookSink({ enabled: true, url: 'https://hooks.example.com/x', secret: 'top-secret' }, fetchFn).save(app);

    const init = fetchFn.mock.calls[0][1]!;
    const headers = init.headers as Record<string, string>;
    const expected = await hmacSha256('top-secret', `${headers['X-AutoApply-Timestamp']}.${init.body}`);
    expect(headers['X-AutoApply-Signature']).toBe(`sha256=${expected}`);
  });
});

describe('#9 backup import is validated', () => {
  it('drops unsafe URLs, unknown fields and wrong types', () => {
    const backup = parseBackup(
      JSON.stringify({
        profile: { firstName: 'Ana', email: 42, isAdmin: true },
        applications: [
          {
            id: 'x',
            company: 'Acme',
            url: 'javascript:alert(1)',
            status: 'hacked',
            appliedAt: 'not a date',
            external: { clickup: { id: '1', url: 'data:text/html,<script>' } },
          },
        ],
      }),
    );
    expect(backup.profile).toMatchObject({ firstName: 'Ana', email: '' });
    expect(backup.profile).not.toHaveProperty('isAdmin');
    const app = backup.applications![0];
    expect(app.url).toBe('');
    expect(app.status).toBe('applied');
    expect(app.external?.clickup.url).toBe('');
    expect(Number.isNaN(Date.parse(app.appliedAt))).toBe(false);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow('not valid JSON');
    expect(() => parseBackup('[1,2]')).toThrow('not an AutoApply backup');
  });

  it('safeHref only allows http(s)', () => {
    expect(safeHref('https://a.com')).toBe('https://a.com');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
  });
});
