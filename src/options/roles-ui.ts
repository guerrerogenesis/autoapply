import {
  parseKeywords,
  ROLE_FIELDS,
  ROLE_TEMPLATES,
  roleFromTemplate,
  slugId,
  type Role,
  type RoleField,
  type RolesState,
} from '../core/roles';
import { safeHref } from '../core/sanitize';
import { load, save } from '../core/storage';
import type { Profile } from '../core/types';

/**
 * Profile tab with sub-tabs (pills): "Base info" + one pill per role + "New role".
 * Every user creates their own roles; nothing is predefined.
 */
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const ROLE_FIELD_LABELS: Record<RoleField, { label: string; multiline?: boolean }> = {
  currentTitle: { label: 'Job title' },
  yearsExperience: { label: 'Years of experience' },
  salaryExpectation: { label: 'Salary expectation' },
  portfolio: { label: 'Portfolio / website' },
  summary: { label: 'Summary for this role', multiline: true },
};

let roles: RolesState = { list: [], defaultId: '' };
/** 'base', 'new' or a role id */
let active = 'base';
let deleteArmed = false;
let onChange: (state: RolesState) => void = () => undefined;

export function activeRole(): Role | null {
  return roles.list.find((r) => r.id === active) ?? null;
}

export function currentRoles(): RolesState {
  return roles;
}

function flash(id: string, text: string) {
  $(id).textContent = text;
  setTimeout(() => ($(id).textContent = ''), 3000);
}

async function persist(message?: string) {
  await save('roles', roles);
  onChange(roles);
  renderPills();
  if (message) flash('role-toast', message);
}

function renderPills() {
  const bar = $('profile-pills');
  bar.innerHTML = '';
  const pill = (id: string, text: string, extra = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `pill ${extra}`.trim();
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(active === id));
    b.textContent = text;
    b.addEventListener('click', () => show(id));
    bar.append(b);
    return b;
  };
  pill('base', 'Base info');
  for (const role of roles.list) {
    const b = pill(role.id, role.name);
    if (role.id === roles.defaultId) {
      const star = document.createElement('span');
      star.className = 'star';
      star.title = 'Default role';
      star.textContent = '★';
      b.append(star);
    }
  }
  pill('new', '+ New role', 'add');
}

export function show(id: string) {
  active = id === 'base' || id === 'new' || roles.list.some((r) => r.id === id) ? id : 'base';
  deleteArmed = false;
  $('role-delete').textContent = 'Delete';
  $('base-view').hidden = active !== 'base';
  $('role-view').hidden = !activeRole();
  $('role-new').hidden = active !== 'new';
  // The CV import works for the base info and for a role (role fields only)
  $('cv-card').hidden = active === 'new';
  $('cv-title').textContent = activeRole() ? `Import from your CV into “${activeRole()!.name}”` : 'Import from your CV';
  $('cv-review').hidden = true;
  if (activeRole()) renderRoleForm(activeRole()!);
  if (active === 'new') renderTemplates();
  renderPills();
}

async function baseProfile(): Promise<Profile> {
  return load('profile');
}

async function renderRoleForm(role: Role) {
  const base = await baseProfile();
  $('role-heading').textContent = role.name;
  $<HTMLInputElement>('r-name').value = role.name;
  $<HTMLInputElement>('r-keywords').value = role.keywords.join(', ');
  $<HTMLInputElement>('r-default').checked = roles.defaultId === role.id;

  const grid = $('role-fields');
  grid.innerHTML = '';
  for (const key of ROLE_FIELDS) {
    const meta = ROLE_FIELD_LABELS[key];
    const wrap = document.createElement('div');
    if (meta.multiline) wrap.className = 'full';
    const label = document.createElement('label');
    label.htmlFor = `r-${key}`;
    label.textContent = meta.label;
    const input = document.createElement(meta.multiline ? 'textarea' : 'input');
    input.id = `r-${key}`;
    input.name = key;
    input.value = role.fields[key] ?? '';
    // Empty = the base value is used. Show it so the user knows what happens.
    const baseValue = base[key]?.trim();
    input.placeholder = baseValue ? `Empty = base: ${baseValue.slice(0, 60)}${baseValue.length > 60 ? '…' : ''}` : 'Empty = not used';
    wrap.append(label, input);
    grid.append(wrap);
  }
}

async function saveRole() {
  const role = activeRole();
  if (!role) return;
  const name = $<HTMLInputElement>('r-name').value.trim().slice(0, 80);
  if (!name) return flash('role-toast', 'Add a role name.');
  role.name = name;
  role.keywords = parseKeywords($<HTMLInputElement>('r-keywords').value);
  for (const key of ROLE_FIELDS) {
    let value = $<HTMLInputElement>(`r-${key}`).value.trim();
    if (key === 'portfolio' && value) value = safeHref(/^https?:\/\//i.test(value) ? value : `https://${value}`) ?? '';
    if (value) role.fields[key] = value;
    else delete role.fields[key];
  }
  if ($<HTMLInputElement>('r-default').checked) roles.defaultId = role.id;
  else if (roles.defaultId === role.id) roles.defaultId = '';
  await persist('Role saved.');
  $('role-heading').textContent = role.name;
}

async function createRole(template: (typeof ROLE_TEMPLATES)[number] | null) {
  const role = roleFromTemplate(template, roles.list.map((r) => r.id));
  roles.list.push(role);
  if (!roles.defaultId && roles.list.length === 1) roles.defaultId = role.id; // first role becomes the default
  await persist();
  show(role.id);
  flash('role-toast', template ? 'Role created. Write your summary for this role and save.' : 'Role created. Give it a name and keywords.');
}

async function duplicateRole() {
  const role = activeRole();
  if (!role) return;
  const name = `${role.name} (copy)`;
  const copy: Role = { ...structuredClone(role), id: slugId(name, roles.list.map((r) => r.id)), name };
  roles.list.splice(roles.list.indexOf(role) + 1, 0, copy);
  await persist();
  show(copy.id);
  flash('role-toast', 'Copy created. Change the name and the keywords.');
}

/** Two clicks to delete (no browser dialog). Saved answers of this role become general. */
async function deleteRole() {
  const role = activeRole();
  if (!role) return;
  if (!deleteArmed) {
    deleteArmed = true;
    $('role-delete').textContent = 'Click again to delete';
    return;
  }
  roles.list = roles.list.filter((r) => r.id !== role.id);
  if (roles.defaultId === role.id) roles.defaultId = '';
  const answers = await load('answers');
  if (answers.some((a) => a.roleId === role.id)) {
    await save('answers', answers.map((a) => (a.roleId === role.id ? { ...a, roleId: undefined } : a)));
  }
  await persist();
  show('base');
}

function renderTemplates() {
  const box = $('role-templates');
  box.innerHTML = '';
  const used = new Set(roles.list.map((r) => r.name.toLowerCase()));
  for (const template of ROLE_TEMPLATES) {
    if (used.has(template.name.toLowerCase())) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pill';
    b.textContent = template.name;
    b.addEventListener('click', () => createRole(template));
    box.append(b);
  }
}

export async function setupRoles(changed: (state: RolesState) => void) {
  onChange = changed;
  roles = await load('roles');
  $('role-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveRole();
  });
  $('role-duplicate').addEventListener('click', duplicateRole);
  $('role-delete').addEventListener('click', deleteRole);
  $('role-blank').addEventListener('click', () => createRole(null));
  show('base');
}

/** Reload after a backup import. */
export async function reloadRoles() {
  roles = await load('roles');
  onChange(roles);
  show('base');
}
