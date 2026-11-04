import { exportAll, importAll, load, newId, save } from '../core/storage';
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
function setupTabs() {
  const buttons = document.querySelectorAll<HTMLButtonElement>('nav [data-tab]');
  buttons.forEach((button) =>
    button.addEventListener('click', () => {
      buttons.forEach((b) => b.setAttribute('aria-selected', String(b === button)));
      document.querySelectorAll<HTMLElement>('main > section').forEach((s) => {
        s.hidden = s.id !== `tab-${button.dataset.tab}`;
      });
      if (button.dataset.tab === 'applications') renderApplications();
    }),
  );
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
  link.href = app.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = app.company;
  cell(link);
  cell(app.role);

  const status = document.createElement('select');
  for (const s of STATUSES) status.add(new Option(s, s, false, s === app.status));
  status.addEventListener('change', async () => {
    app.status = status.value as ApplicationStatus;
    await save('applications', all);
    renderApplications();
  });
  cell(status);

  const notes = document.createElement('input');
  notes.value = app.notes;
  notes.placeholder = 'Recruiter, next step…';
  notes.addEventListener('change', () => {
    app.notes = notes.value;
    save('applications', all);
  });
  cell(notes);

  const remove = document.createElement('button');
  remove.className = 'small danger';
  remove.textContent = '✕';
  remove.title = 'Delete';
  remove.addEventListener('click', async () => {
    await save('applications', all.filter((a) => a.id !== app.id));
    renderApplications();
  });
  cell(remove);
  return row;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCsv() {
  const applications = await load('applications');
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    ['date', 'company', 'role', 'status', 'url', 'notes'].join(','),
    ...applications.map((a) => [a.appliedAt.slice(0, 10), a.company, a.role, a.status, a.url, a.notes].map(escape).join(',')),
  ];
  download('applications.csv', lines.join('\n'), 'text/csv');
}

/* ---------- Backup ---------- */
async function exportJson() {
  download(`autoapply-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll(), null, 2), 'application/json');
}

async function importJson(file: File) {
  try {
    await importAll(JSON.parse(await file.text()));
    await renderProfile();
    answers = await load('answers');
    renderAnswers();
    flash('backup-toast', 'Backup imported.');
  } catch {
    flash('backup-toast', 'This file is not a valid backup.');
  }
}

/* ---------- Init ---------- */
async function init() {
  setupTabs();
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
  $('export-json').addEventListener('click', exportJson);
  $('import-button').addEventListener('click', () => $('import-file').click());
  $<HTMLInputElement>('import-file').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) importJson(file);
  });
}

init();
