import { ClickUpSink, parseListId } from '../core/sinks/clickup-sink';
import { applicationsSheet, ExcelSink, isValidFileName, XLSX_MIME } from '../core/sinks/excel-sink';
import { createSinks, integrationStatus, notifyChange } from '../core/sinks/registry';
import { appsScriptCode, GoogleSheetsSink, newSecret } from '../core/sinks/sheets-sink';
import type { SinkResult } from '../core/sinks/types';
import { WebhookSink } from '../core/sinks/webhook-sink';
import { downloadsWriter } from '../core/downloads-writer';
import { applicationRepository, exportAll, importAll, load, newId, save } from '../core/storage';
import { buildXlsx } from '../core/xlsx';
import { parseBackup } from '../core/backup';
import { neutralizeFormula, safeHref } from '../core/sanitize';
import { restrictStorage } from '../background-helpers';
import type { Application, ApplicationStatus, Profile, SavedAnswer } from '../core/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const PROFILE_FIELDS: { key: keyof Profile; label: string; full?: boolean; multiline?: boolean }[] = [
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone (with country code)' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'linkedin', label: 'LinkedIn URL' },
  { key: 'github', label: 'GitHub URL' },
  { key: 'portfolio', label: 'Portfolio / website' },
  { key: 'currentTitle', label: 'Current title' },
  { key: 'currentCompany', label: 'Current company' },
  { key: 'yearsExperience', label: 'Years of experience' },
  { key: 'salaryExpectation', label: 'Salary expectation' },
  { key: 'noticePeriod', label: 'Availability / notice period' },
  { key: 'englishLevel', label: 'English level' },
  { key: 'summary', label: 'Short summary about you', full: true, multiline: true },
];

const STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'ghosted'];

function flash(id: string, text: string) {
  $(id).textContent = text;
  setTimeout(() => ($(id).textContent = ''), 2500);
}

/* ---------- Tabs ---------- */
function showTab(tab: string) {
  const buttons = document.querySelectorAll<HTMLButtonElement>('nav [data-tab]');
  if (![...buttons].some((b) => b.dataset.tab === tab)) return;
  buttons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  document.querySelectorAll<HTMLElement>('main > section').forEach((s) => {
    s.hidden = s.id !== `tab-${tab}`;
  });
  if (tab === 'applications') renderApplications();
  history.replaceState(null, '', `#${tab}`);
}

function setupTabs() {
  document.querySelectorAll<HTMLButtonElement>('nav [data-tab]').forEach((button) =>
    button.addEventListener('click', () => showTab(button.dataset.tab!)),
  );
  // The popup opens this page with #integrations
  const fromHash = location.hash.slice(1);
  if (fromHash) showTab(fromHash);
  window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));
}

/* ---------- Profile ---------- */
async function renderProfile() {
  const profile = await load('profile');
  const form = $('profile-form');
  form.innerHTML = '';
  for (const field of PROFILE_FIELDS) {
    const wrapper = document.createElement('div');
    if (field.full) wrapper.className = 'full';
    const label = document.createElement('label');
    label.htmlFor = `p-${field.key}`;
    label.textContent = field.label;
    const input = document.createElement(field.multiline ? 'textarea' : 'input');
    input.id = `p-${field.key}`;
    input.name = field.key;
    input.value = profile[field.key];
    wrapper.append(label, input);
    form.append(wrapper);
  }
}

async function saveProfile() {
  const data = new FormData($<HTMLFormElement>('profile-form'));
  const profile = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, String(data.get(f.key) ?? '').trim()])) as unknown as Profile;
  await save('profile', profile);
  flash('profile-toast', 'Profile saved.');
}

/* ---------- Answers ---------- */
let answers: SavedAnswer[] = [];

function renderAnswers() {
  const list = $('answers');
  list.innerHTML = '';
  if (!answers.length) list.innerHTML = '<p class="muted">No answers yet. Add one, or use “Save my answers from this page” in the popup.</p>';
  answers.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'card stack answer';
    const question = document.createElement('input');
    question.placeholder = 'Question, e.g. Why do you want to work here?';
    question.value = item.question;
    question.addEventListener('input', () => (item.question = question.value));
    const answer = document.createElement('textarea');
    answer.placeholder = 'Your answer';
    answer.value = item.answer;
    answer.addEventListener('input', () => (item.answer = answer.value));
    const remove = document.createElement('button');
    remove.className = 'small danger';
    remove.textContent = 'Delete';
    remove.addEventListener('click', () => {
      answers.splice(index, 1);
      renderAnswers();
    });
    card.append(question, answer, remove);
    list.append(card);
  });
}

async function saveAnswers() {
  answers = answers
    .filter((a) => a.question.trim() && a.answer.trim())
    .map((a) => ({ ...a, updatedAt: new Date().toISOString() }));
  await save('answers', answers);
  renderAnswers();
  flash('answers-toast', 'Answers saved.');
}

/* ---------- Applications ---------- */
async function renderApplications() {
  const applications = await load('applications');
  const stats = $('stats');
  stats.innerHTML = '';
  const counts: [string, number][] = [
    ['Total', applications.length],
    ...STATUSES.map((s) => [s, applications.filter((a) => a.status === s).length] as [string, number]),
  ];
  for (const [name, count] of counts) {
    const box = document.createElement('div');
    box.className = 'card stat';
    box.innerHTML = `<b>${count}</b><span class="muted"></span>`;
    box.querySelector('span')!.textContent = name;
    stats.append(box);
  }

  const body = $('applications');
  body.innerHTML = '';
  if (!applications.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted">No applications yet. Use “Save to history” in the popup.</td></tr>';
    return;
  }
  for (const app of applications) body.append(applicationRow(app, applications));
}

function applicationRow(app: Application, all: Application[]): HTMLTableRowElement {
  const row = document.createElement('tr');
  const cell = (content: Node | string) => {
    const td = document.createElement('td');
    td.append(content);
    row.append(td);
  };

  cell(new Date(app.appliedAt).toLocaleDateString());
  const link = document.createElement('a');
  const href = safeHref(app.url); // security fix #9: only http(s) links
  if (href) link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = app.company || new URL(app.url || 'https://unknown').hostname;
  for (const [sinkId, ref] of Object.entries(app.external ?? {})) {
    const refHref = safeHref(ref.url);
    if (!refHref) continue;
    const extra = document.createElement('a');
    extra.href = refHref;
    extra.target = '_blank';
    extra.rel = 'noopener';
    extra.textContent = ` · ${sinkId}`;
    link.after(extra);
  }
  cell(app.role);

  const status = document.createElement('select');
  for (const s of STATUSES) status.add(new Option(s, s, false, s === app.status));
  status.addEventListener('change', async () => {
    app.status = status.value as ApplicationStatus;
    await save('applications', all);
    renderApplications();
    notifyIntegrations('update', app, ['status']);
  });
  cell(status);

  const notes = document.createElement('input');
  notes.value = app.notes;
  notes.placeholder = 'Recruiter, next step…';
  notes.addEventListener('change', async () => {
    app.notes = notes.value;
    await save('applications', all);
    notifyIntegrations('update', app, ['notes']);
  });
  cell(notes);

  const remove = document.createElement('button');
  remove.className = 'small danger';
  remove.textContent = '✕';
  remove.title = 'Delete';
  remove.addEventListener('click', async () => {
    await save('applications', all.filter((a) => a.id !== app.id));
    renderApplications();
    notifyIntegrations('remove', app);
  });
  cell(remove);
  return row;
}

function download(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCsv() {
  const applications = await load('applications');
  // Security fix #5: neutralize formulas, then quote for CSV.
  const escape = (v: string) => `"${neutralizeFormula(v).replace(/"/g, '""')}"`;
  const lines = [
    ['date', 'company', 'role', 'status', 'url', 'notes'].join(','),
    ...applications.map((a) => [a.appliedAt.slice(0, 10), a.company, a.role, a.status, a.url, a.notes].map(escape).join(',')),
  ];
  // The BOM (\uFEFF) makes Excel read accents (México, Pérez) correctly.
  download('applications.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

/* ---------- Integrations ---------- */

/**
 * Chrome only lets the extension call an external API after you allow that site.
 * We ask when you save, not at install, so the extension stays private by default.
 * Note: permissions.request() must run first in the click handler (before any await).
 */
function originsFor(sink: 'clickup' | 'webhook', url = ''): string[] {
  if (sink === 'clickup') return ['https://api.clickup.com/*'];
  try {
    const { origin, hostname } = new URL(url);
    // Google Apps Script answers with a redirect to googleusercontent.com
    return hostname === 'script.google.com' ? [`${origin}/*`, 'https://script.googleusercontent.com/*'] : [`${origin}/*`];
  } catch {
    return [];
  }
}

function formValues(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    enabled: data.get('enabled') === 'on',
    text: (name: string) => String(data.get(name) ?? '').trim(),
  };
}

function showResult(sink: string, result: SinkResult | string) {
  const toastEl = document.querySelector<HTMLElement>(`[data-toast="${sink}"]`)!;
  if (typeof result === 'string') {
    toastEl.style.color = 'var(--ok)';
    toastEl.textContent = result;
  } else {
    toastEl.style.color = result.ok ? 'var(--ok)' : 'var(--danger)';
    toastEl.textContent = result.ok ? `Connected ✓ ${result.url ?? ''}` : result.error ?? 'Error';
  }
}

/** "Off", "Needs setup" or "On" next to each switch. */
async function renderBadges() {
  for (const status of integrationStatus(await load('settings'))) {
    const badge = document.querySelector<HTMLElement>(`[data-badge="${status.id}"]`);
    if (!badge) continue;
    badge.className = 'badge';
    if (!status.enabled) badge.textContent = 'Off';
    else if (!status.configured) {
      badge.textContent = 'Needs setup';
      badge.classList.add('warn');
    } else {
      badge.textContent = 'On';
      badge.classList.add('on');
    }
  }
}

/**
 * Switch behavior:
 * - Off: saved right away (no permission needed).
 * - On: shows the fields. It is saved when you click Save, because Chrome asks
 *   for the site permission then, and the fields need to be filled first.
 */
function setupSwitches() {
  document.querySelectorAll<HTMLFormElement>('form.integration').forEach((form) => {
    const sink = form.dataset.sink as 'sheets' | 'clickup' | 'excel' | 'webhook';
    const toggle = form.querySelector<HTMLInputElement>('.switch input')!;
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const badge = document.querySelector<HTMLElement>(`[data-badge="${sink}"]`)!;
        badge.className = 'badge warn';
        badge.textContent = 'Not saved';
        form.querySelector<HTMLInputElement>('.int-body input')?.focus();
        showResult(sink, 'Fill this in and click Save.');
        return;
      }
      const settings = await load('settings');
      settings.sinks[sink].enabled = false;
      await save('settings', settings);
      showResult(sink, 'Turned off.');
      renderBadges();
    });
  });
}

async function renderIntegrations() {
  const settings = await load('settings');
  const { sinks } = settings;
  // The secret is created once, so the script you copy always matches.
  if (!sinks.sheets.secret) {
    sinks.sheets.secret = newSecret();
    await save('settings', settings);
  }
  const sh = $<HTMLFormElement>('sheets-form');
  (sh.elements.namedItem('enabled') as HTMLInputElement).checked = sinks.sheets.enabled;
  (sh.elements.namedItem('url') as HTMLInputElement).value = sinks.sheets.url;
  sheetsSecret = sinks.sheets.secret;
  if (!sinks.webhook.secret) {
    sinks.webhook.secret = newSecret();
    await save('settings', settings);
  }
  webhookSecret = sinks.webhook.secret;
  const cu = $<HTMLFormElement>('clickup-form');
  (cu.elements.namedItem('enabled') as HTMLInputElement).checked = sinks.clickup.enabled;
  (cu.elements.namedItem('token') as HTMLInputElement).value = sinks.clickup.token;
  (cu.elements.namedItem('listId') as HTMLInputElement).value = sinks.clickup.listId;
  (cu.elements.namedItem('status') as HTMLInputElement).value = sinks.clickup.status;
  const xl = $<HTMLFormElement>('excel-form');
  (xl.elements.namedItem('enabled') as HTMLInputElement).checked = sinks.excel.enabled;
  (xl.elements.namedItem('fileName') as HTMLInputElement).value = sinks.excel.fileName;
  const wh = $<HTMLFormElement>('webhook-form');
  (wh.elements.namedItem('enabled') as HTMLInputElement).checked = sinks.webhook.enabled;
  (wh.elements.namedItem('url') as HTMLInputElement).value = sinks.webhook.url;
}

function readClickUp() {
  const v = formValues($<HTMLFormElement>('clickup-form'));
  return { enabled: v.enabled, token: v.text('token'), listId: parseListId(v.text('listId')), status: v.text('status') };
}

let sheetsSecret = '';

function readSheets() {
  const v = formValues($<HTMLFormElement>('sheets-form'));
  return { enabled: v.enabled, url: v.text('url'), secret: sheetsSecret };
}

const SHEETS_ORIGINS = ['https://script.google.com/*', 'https://script.googleusercontent.com/*'];

function readExcel() {
  const v = formValues($<HTMLFormElement>('excel-form'));
  return { enabled: v.enabled, fileName: v.text('fileName') || 'AutoApply/applications.xlsx' };
}

let webhookSecret = '';

function readWebhook() {
  const v = formValues($<HTMLFormElement>('webhook-form'));
  return { enabled: v.enabled, url: v.text('url'), secret: webhookSecret };
}

/**
 * Security fix #11: if the secret was exposed (clipboard history, a shared screenshot…),
 * create a new one. The old script / receiver stops working until you update it.
 */
async function regenerateSecret(sink: 'sheets' | 'webhook') {
  const settings = await load('settings');
  const secret = newSecret();
  settings.sinks[sink].secret = secret;
  await save('settings', settings);
  if (sink === 'sheets') {
    sheetsSecret = secret;
    showResult('sheets', 'New secret created. Copy the script again and paste it in Apps Script (Deploy → Manage deployments → Edit → New version).');
  } else {
    webhookSecret = secret;
    showResult('webhook', 'New secret created. Copy it again into your receiver.');
  }
}

function setupIntegrations() {
  $('clickup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const config = readClickUp();
    if (config.enabled && (!config.token || !config.listId)) {
      return showResult('clickup', { sinkId: 'clickup', ok: false, error: 'Add the API token and the list URL or ID.' });
    }
    const ask = config.enabled ? chrome.permissions.request({ origins: originsFor('clickup') }) : Promise.resolve(true);
    ask.then(async (granted) => {
      if (!granted) return showResult('clickup', { sinkId: 'clickup', ok: false, error: 'Permission for api.clickup.com was not given.' });
      const settings = await load('settings');
      settings.sinks.clickup = config;
      await save('settings', settings);
      // Show the clean ID if you pasted the list URL
      ($<HTMLFormElement>('clickup-form').elements.namedItem('listId') as HTMLInputElement).value = config.listId;
      if (!config.enabled) return showResult('clickup', 'Saved.');
      const result = await new ClickUpSink(config).testConnection();
      showResult('clickup', result.ok ? `Saved and connected ✓ ${result.url ?? ''}` : result);
    });
  });

  $('webhook-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const config = readWebhook();
    const origins = originsFor('webhook', config.url);
    if (config.enabled && !origins.length) {
      return showResult('webhook', { sinkId: 'webhook', ok: false, error: 'The URL is not valid.' });
    }
    const ask = config.enabled ? chrome.permissions.request({ origins }) : Promise.resolve(true);
    ask.then(async (granted) => {
      if (!granted) return showResult('webhook', { sinkId: 'webhook', ok: false, error: 'Permission for this URL was not given.' });
      const settings = await load('settings');
      settings.sinks.webhook = config;
      await save('settings', settings);
      showResult('webhook', 'Saved.');
    });
  });

  $('sheets-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const config = readSheets();
    if (config.enabled && !/^https:\/\/script\.google\.com\/.+\/exec$/.test(config.url)) {
      return showResult('sheets', { sinkId: 'sheets', ok: false, error: 'Paste the Web app URL from Apps Script (it ends with /exec).' });
    }
    const ask = config.enabled ? chrome.permissions.request({ origins: SHEETS_ORIGINS }) : Promise.resolve(true);
    ask.then(async (granted) => {
      if (!granted) return showResult('sheets', { sinkId: 'sheets', ok: false, error: 'Permission for Google Apps Script was not given.' });
      const settings = await load('settings');
      settings.sinks.sheets = config;
      await save('settings', settings);
      if (!config.enabled) return showResult('sheets', 'Saved.');
      const result = await new GoogleSheetsSink(config).testConnection();
      showResult('sheets', result.ok ? 'Saved and connected ✓' : result);
    });
  });

  document.querySelector('[data-regen="sheets"]')!.addEventListener('click', () => regenerateSecret('sheets'));
  document.querySelector('[data-regen="webhook"]')!.addEventListener('click', () => regenerateSecret('webhook'));
  document.querySelector('[data-copy="webhook"]')!.addEventListener('click', async () => {
    await navigator.clipboard.writeText(webhookSecret);
    showResult('webhook', 'Signing secret copied.');
  });

  document.querySelector('[data-copy="sheets"]')!.addEventListener('click', async () => {
    await navigator.clipboard.writeText(appsScriptCode(sheetsSecret));
    showResult('sheets', 'Script copied. Paste it in Apps Script.');
  });

  document.querySelector('[data-test="sheets"]')!.addEventListener('click', () => {
    const config = readSheets();
    chrome.permissions.request({ origins: SHEETS_ORIGINS }).then(async (granted) => {
      if (!granted) return showResult('sheets', { sinkId: 'sheets', ok: false, error: 'Permission was not given.' });
      showResult('sheets', 'Testing…');
      const result = await new GoogleSheetsSink(config).testConnection();
      showResult('sheets', result.ok ? 'Connected ✓' : result);
    });
  });

  $('excel-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const config = readExcel();
    if (!isValidFileName(config.fileName)) {
      return showResult('excel', { sinkId: 'excel', ok: false, error: 'Use a name like AutoApply/applications.xlsx' });
    }
    const ask = config.enabled ? chrome.permissions.request({ permissions: ['downloads'] }) : Promise.resolve(true);
    ask.then(async (granted) => {
      if (!granted) return showResult('excel', { sinkId: 'excel', ok: false, error: 'Permission for downloads was not given.' });
      const settings = await load('settings');
      settings.sinks.excel = config;
      await save('settings', settings);
      if (!config.enabled) return showResult('excel', 'Saved.');
      const result = await new ExcelSink(config, applicationRepository, downloadsWriter).sync();
      showResult('excel', result.ok ? `Saved. File: Downloads/${config.fileName}` : result);
    });
  });

  document.querySelector('[data-test="excel"]')!.addEventListener('click', () => {
    const config = readExcel();
    chrome.permissions.request({ permissions: ['downloads'] }).then(async (granted) => {
      if (!granted) return showResult('excel', { sinkId: 'excel', ok: false, error: 'Permission was not given.' });
      const result = await new ExcelSink(config, applicationRepository, downloadsWriter).sync();
      showResult('excel', result.ok ? `Updated: Downloads/${config.fileName}` : result);
    });
  });

  document.querySelector('[data-test="clickup"]')!.addEventListener('click', () => {
    const config = readClickUp();
    chrome.permissions.request({ origins: originsFor('clickup') }).then(async (granted) => {
      if (!granted) return showResult('clickup', { sinkId: 'clickup', ok: false, error: 'Permission was not given.' });
      showResult('clickup', 'Testing…');
      showResult('clickup', await new ClickUpSink(config).testConnection());
    });
  });

  document.querySelector('[data-test="webhook"]')!.addEventListener('click', () => {
    const config = readWebhook();
    const origins = originsFor('webhook', config.url);
    if (!origins.length) return showResult('webhook', { sinkId: 'webhook', ok: false, error: 'The URL is not valid.' });
    chrome.permissions.request({ origins }).then(async (granted) => {
      if (!granted) return showResult('webhook', { sinkId: 'webhook', ok: false, error: 'Permission was not given.' });
      showResult('webhook', 'Sending…');
      const result = await new WebhookSink(config).testConnection();
      showResult('webhook', result.ok ? { ...result, url: '(a test row was sent)' } : result);
    });
  });
}

async function exportXlsx() {
  const bytes = buildXlsx(applicationsSheet(await load('applications')));
  download(`applications-${new Date().toISOString().slice(0, 10)}.xlsx`, bytes as BlobPart, XLSX_MIME);
}

/**
 * The history page changes data too (status, notes, delete).
 * Tell the adapters that support it (Google Sheets, Excel) so they stay up to date.
 */
async function notifyIntegrations(change: 'update' | 'remove', app: Application, changed: (keyof Application)[] = []) {
  const sinks = createSinks(await load('settings'), { repo: applicationRepository, fileWriter: downloadsWriter });
  const results = await notifyChange(change, app, sinks, changed);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) flash('applications-toast', failed.map((r) => `${r.sinkId}: ${r.error}`).join(' · '));
  else if (results.length) flash('applications-toast', `Updated in ${results.map((r) => r.sinkId).join(', ')}.`);
}

/* ---------- Backup ---------- */
async function exportJson() {
  download(`autoapply-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll(), null, 2), 'application/json');
}

async function importJson(file: File) {
  try {
    // Security fix #9: the file is validated and cleaned before anything is saved.
    await importAll(parseBackup(await file.text()));
    await renderProfile();
    answers = await load('answers');
    renderAnswers();
    flash('backup-toast', 'Backup imported.');
  } catch (error) {
    flash('backup-toast', error instanceof Error ? error.message : 'This file is not a valid backup.');
  }
}

/* ---------- Init ---------- */
async function init() {
  await restrictStorage();
  setupTabs();
  setupIntegrations();
  setupSwitches();
  await renderIntegrations();
  await renderBadges();
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) renderBadges();
  });
  await renderProfile();
  answers = await load('answers');
  renderAnswers();

  $('save-profile').addEventListener('click', saveProfile);
  $('profile-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveProfile();
  });
  $('add-answer').addEventListener('click', () => {
    answers.push({ id: newId(), question: '', answer: '', updatedAt: new Date().toISOString() });
    renderAnswers();
  });
  $('save-answers').addEventListener('click', saveAnswers);
  $('export-csv').addEventListener('click', exportCsv);
  $('export-xlsx').addEventListener('click', exportXlsx);
  $('export-json').addEventListener('click', exportJson);
  $('import-button').addEventListener('click', () => $('import-file').click());
  $<HTMLInputElement>('import-file').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) importJson(file);
  });
}

init();
