import { guessCompany, similarity } from '../core/matcher';
import { load, newId, save } from '../core/storage';
import type { FillReport } from '../core/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function toast(text: string) {
  $('toast').textContent = text;
  setTimeout(() => ($('toast').textContent = ''), 3000);
}

async function activeTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Inject the content script in all frames, then call a method in each frame. */
async function runInTab<T>(method: 'fill' | 'collect', overwrite = false): Promise<T[]> {
  const tab = await activeTab();
  if (!tab.id) return [];
  const target = { tabId: tab.id, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['content.js'] });
  const results = await chrome.scripting.executeScript({
    target,
    args: [method, overwrite],
    func: (m: 'fill' | 'collect', ow: boolean) => (m === 'fill' ? window.__autoapply?.fill(ow) : window.__autoapply?.collect()),
  });
  return results.map((r) => r.result as T).filter(Boolean);
}

async function fill() {
  const button = $<HTMLButtonElement>('fill');
  button.disabled = true;
  try {
    const reports = await runInTab<FillReport>('fill', $<HTMLInputElement>('overwrite').checked);
    const filled = reports.reduce((n, r) => n + r.filled, 0);
    const answered = reports.reduce((n, r) => n + r.answered, 0);
    const skipped = reports.reduce((n, r) => n + r.skipped, 0);
    const items = reports.flatMap((r) => r.fields);

    const result = $('result');
    result.textContent = `Filled ${filled} fields, ${answered} answers. ${skipped ? `${skipped} already had text.` : ''}`;
    if (items.length) {
      const list = document.createElement('ul');
      for (const item of items) {
        const li = document.createElement('li');
        li.textContent = `${item.label} ← ${item.source}`;
        list.append(li);
      }
      result.append(list);
    }
  } catch (error) {
    $('result').textContent = 'This page cannot be filled (Chrome pages and the Web Store are blocked).';
    console.error(error);
  } finally {
    button.disabled = false;
  }
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

async function logApplication() {
  const tab = await activeTab();
  const company = $<HTMLInputElement>('company').value.trim();
  if (!company) return toast('Add the company name.');
  const applications = await load('applications');
  if (applications.some((a) => a.url === tab.url)) return toast('This job is already in your history.');
  applications.unshift({
    id: newId(),
    company,
    role: $<HTMLInputElement>('role').value.trim(),
    url: tab.url ?? '',
    appliedAt: new Date().toISOString(),
    status: 'applied',
    notes: '',
  });
  await save('applications', applications);
  toast(`Saved. You have ${applications.length} applications.`);
}

async function init() {
  const tab = await activeTab();
  const title = tab.title ?? '';
  $<HTMLInputElement>('company').value = guessCompany(tab.url ?? '', title);
  $<HTMLInputElement>('role').value = title.split(/[|\-–]| at | en /i)[0].trim();

  const profile = await load('profile');
  $('profile-warning').hidden = Boolean(profile.email || profile.firstName);

  $('fill').addEventListener('click', fill);
  $('collect').addEventListener('click', collect);
  $('log').addEventListener('click', logApplication);
  $('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

init();
