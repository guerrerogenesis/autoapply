import { guessCompany, similarity } from '../core/matcher';
import { createSinks, integrationStatus, saveApplication } from '../core/sinks/registry';
import type { ApplicationSink, SinkResult } from '../core/sinks/types';
import { downloadsWriter } from '../core/downloads-writer';
import { safeHref } from '../core/sanitize';
import { restrictStorage } from '../background-helpers';
import { applicationRepository, load, newId, save } from '../core/storage';
import type { Application, FillPlan, FillReport, Profile, SavedAnswer } from '../core/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function toast(text: string) {
  $('toast').textContent = text;
  setTimeout(() => ($('toast').textContent = ''), 3000);
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

interface FramePlan {
  frameId: number;
  plan: FillPlan;
}

/**
 * Inject the content script (no data yet) and ask each frame who it is.
 * Only the top page, same-origin iframes and known job platforms are trusted (security fix #2).
 */
async function trustedFrames(tabId: number): Promise<{ trusted: number[]; blocked: string[] }> {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
  const infos = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => window.__sabi?.frameInfo(),
  });
  const trusted: number[] = [];
  const blocked = new Set<string>();
  for (const { frameId, result } of infos) {
    if (!result) continue;
    if (result.trusted) trusted.push(frameId);
    else blocked.add(result.origin === 'null' ? 'sandboxed frame' : new URL(result.origin).hostname);
  }
  return { trusted, blocked: [...blocked] };
}

let currentPlans: FramePlan[] = [];
let currentTabId = 0;

/** Step 1: show what will be filled. Nothing is written to the page yet (security fix #1, #3). */
async function preview() {
  const button = $<HTMLButtonElement>('fill');
  button.disabled = true;
  const result = $('result');
  result.textContent = '';
  try {
    const tab = await activeTab();
    if (!tab.id) return;
    currentTabId = tab.id;
    const [profile, answers] = await Promise.all([load('profile'), load('answers')]);
    const { trusted, blocked } = await trustedFrames(tab.id);

    // The profile is only sent to trusted frames, as arguments (security fix #4).
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: trusted },
      args: [profile, answers, $<HTMLInputElement>('overwrite').checked],
      func: (p: Profile, a: SavedAnswer[], ow: boolean) => window.__sabi?.plan(p, a, ow),
    });
    currentPlans = results.filter((r) => r.result).map((r) => ({ frameId: r.frameId, plan: r.result as FillPlan }));
    renderPreview(blocked);
  } catch (error) {
    result.textContent = 'This page cannot be filled (Chrome pages and the Web Store are blocked).';
    console.error(error);
  } finally {
    button.disabled = false;
  }
}

function renderPreview(blocked: string[]) {
  const result = $('result');
  result.innerHTML = '';
  const items = currentPlans.flatMap((fp) => fp.plan.items.map((item) => ({ ...item, frameId: fp.frameId })));
  const hidden = currentPlans.reduce((n, fp) => n + fp.plan.hidden, 0);
  const skipped = currentPlans.reduce((n, fp) => n + fp.plan.skipped, 0);

  const warnings: string[] = [];
  if (hidden) warnings.push(`⚠ ${hidden} hidden field${hidden > 1 ? 's' : ''} asked for your data and ${hidden > 1 ? 'were' : 'was'} ignored. Be careful with this page.`);
  if (blocked.length) warnings.push(`⚠ Not filled: third-party frame${blocked.length > 1 ? 's' : ''} (${blocked.join(', ')}).`);
  if (skipped) warnings.push(`${skipped} field${skipped > 1 ? 's' : ''} already had text.`);
  for (const text of warnings) {
    const p = document.createElement('p');
    p.className = text.startsWith('⚠') ? 'warn' : 'muted';
    p.textContent = text;
    result.append(p);
  }

  if (!items.length) {
    const p = document.createElement('p');
    p.textContent = 'No fields to fill on this page.';
    result.append(p);
    return;
  }

  const list = document.createElement('div');
  list.className = 'plan';
  for (const item of items) {
    const row = document.createElement('label');
    row.className = 'plan-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = item.selected;
    box.dataset.ref = String(item.ref);
    box.dataset.frame = String(item.frameId);
    const text = document.createElement('span');
    text.textContent = item.kind === 'answer' ? `${item.label} ← saved answer “${item.source}”` : `${item.label} ← ${item.source}`;
    row.append(box, text);
    list.append(row);
  }
  result.append(list);
  if (items.some((i) => i.kind === 'answer')) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Saved answers are not ticked. Tick them if this question is really for this job.';
    result.append(note);
  }

  const confirm = document.createElement('button');
  confirm.className = 'primary';
  confirm.style.width = '100%';
  confirm.textContent = 'Fill selected fields';
  confirm.addEventListener('click', applySelected);
  result.append(confirm);
}

/** Step 2: fill only the ticked fields, frame by frame. */
async function applySelected() {
  const byFrame = new Map<number, number[]>();
  document.querySelectorAll<HTMLInputElement>('.plan input:checked').forEach((box) => {
    const frameId = Number(box.dataset.frame);
    byFrame.set(frameId, [...(byFrame.get(frameId) ?? []), Number(box.dataset.ref)]);
  });
  let filled = 0;
  let answered = 0;
  for (const [frameId, refs] of byFrame) {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: currentTabId, frameIds: [frameId] },
      args: [refs],
      func: (r: number[]) => window.__sabi?.apply(r),
    });
    const report = res?.result as FillReport | undefined;
    filled += report?.filled ?? 0;
    answered += report?.answered ?? 0;
  }
  currentPlans = [];
  $('result').textContent = `Filled ${filled} fields${answered ? ` and ${answered} answers` : ''}. Check them before you submit.`;
}

/** Inject the content script in trusted frames only and call a method. */
async function runInTab<T>(method: 'collect'): Promise<T[]> {
  const tab = await activeTab();
  if (!tab.id) return [];
  const { trusted } = await trustedFrames(tab.id);
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, frameIds: trusted },
    args: [method],
    func: (m: 'collect') => window.__sabi?.[m](),
  });
  return results.map((r) => r.result as T).filter(Boolean);
}

async function collect() {
  try {
    const found = (await runInTab<{ question: string; answer: string }[]>('collect')).flat();
    if (!found.length) return toast('No long answers found (40+ characters).');

    const answers = await load('answers');
    let added = 0;
    for (const item of found) {
      // Same question already saved? Update it instead of creating a copy.
      const existing = answers.find((a) => similarity(a.question, item.question) > 0.8);
      if (existing) {
        existing.answer = item.answer;
        existing.updatedAt = new Date().toISOString();
      } else {
        answers.push({ id: newId(), ...item, updatedAt: new Date().toISOString() });
        added++;
      }
    }
    await save('answers', answers);
    toast(`Saved ${found.length} answers (${added} new).`);
  } catch (error) {
    toast('Could not read this page.');
    console.error(error);
  }
}

/**
 * The popup does not know where the application is saved.
 * It asks the registry for the active adapters and calls the same save() on all of them.
 */
async function logApplication() {
  const tab = await activeTab();
  // Company is optional (some pages do not show it). The URL is what identifies the job.
  const company = $<HTMLInputElement>('company').value.trim();
  if (!tab.url?.startsWith('http')) return toast('Open the job page first.');

  const button = $<HTMLButtonElement>('log');
  button.disabled = true;
  try {
    const sinks = createSinks(await load('settings'), { repo: applicationRepository, fileWriter: downloadsWriter });
    const application: Application = {
      id: newId(),
      company,
      role: $<HTMLInputElement>('role').value.trim(),
      url: tab.url ?? '',
      appliedAt: new Date().toISOString(),
      status: 'applied',
      notes: '',
    };
    const results = await saveApplication(application, sinks, applicationRepository);
    renderSaveResults(results, sinks);
  } finally {
    button.disabled = false;
  }
}

/** "Saves to: This browser · Google Sheets · ClickUp", so you always know where it goes. */
function renderDestinations(settings: Awaited<ReturnType<typeof load<'settings'>>>) {
  const names = ['This browser'];
  const warnings: string[] = [];
  for (const status of integrationStatus(settings)) {
    if (!status.enabled) continue;
    if (status.configured) names.push(status.label);
    else warnings.push(`${status.label} needs setup`);
  }
  $('destinations').textContent = `Saves to: ${names.join(' · ')}${warnings.length ? ` (${warnings.join(', ')})` : ''}`;
}

function renderSaveResults(results: SinkResult[], sinks: ApplicationSink[]) {
  const box = $('log-result');
  box.innerHTML = '';
  const label = (id: string) => sinks.find((s) => s.id === id)?.label ?? id;
  for (const result of results) {
    const line = document.createElement('div');
    line.className = result.ok ? 'ok' : 'error';
    line.textContent = `${result.ok ? '✓' : '✕'} ${label(result.sinkId)}${result.ok ? '' : `: ${result.error}`}`;
    const href = safeHref(result.url);
    if (result.ok && href) {
      const link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.textContent = ' open';
      line.append(link);
    }
    box.append(line);
  }
}

async function init() {
  await restrictStorage();
  const tab = await activeTab();
  const title = tab.title ?? '';
  // The page controls its title: drop formula-like starts and limit the length (security fix #5).
  const fromPage = (text: string) => text.replace(/^[=+\-@\s]+/, '').slice(0, 200).trim();
  $<HTMLInputElement>('company').value = fromPage(guessCompany(tab.url ?? '', title));
  $<HTMLInputElement>('role').value = fromPage(title.split(/[|\-–]| at | en /i)[0]);

  renderDestinations(await load('settings'));

  const profile = await load('profile');
  $('profile-warning').hidden = Boolean(profile.email || profile.firstName);

  $('fill').addEventListener('click', preview);
  $('collect').addEventListener('click', collect);
  $('log').addEventListener('click', logApplication);
  $('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
  $('change-destinations').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html#integrations') });
  });
}

init();
