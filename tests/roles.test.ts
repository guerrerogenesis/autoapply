import { describe, expect, it } from 'vitest';
import { parseBackup } from '../src/core/backup';
import {
  answersForRole,
  DEFAULT_ROLES,
  parseKeywords,
  pickRole,
  profileForRole,
  ROLE_TEMPLATES,
  roleFromTemplate,
  roleOverrides,
  type RolesState,
} from '../src/core/roles';
import { EMPTY_PROFILE, type Profile, type SavedAnswer } from '../src/core/types';

/** Roles built from the generic templates, like a user would create them. */
const state: RolesState = (() => {
  const list = ROLE_TEMPLATES.filter((t) =>
    ['Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Data Analyst', 'BI Developer', 'CRM Specialist'].includes(t.name),
  ).reduce<RolesState['list']>((acc, t) => [...acc, roleFromTemplate(t, acc.map((r) => r.id))], []);
  return { list, defaultId: list[0].id };
})();
const name = (title: string) => pickRole(title, state).role?.name;

describe('new users', () => {
  it('start with no roles (nothing personal is predefined)', () => {
    expect(DEFAULT_ROLES).toEqual({ list: [], defaultId: '' });
    expect(pickRole('Frontend Developer', DEFAULT_ROLES).role).toBeNull();
  });

  it('templates only bring a name and keywords, never a summary or salary', () => {
    for (const t of ROLE_TEMPLATES) {
      const role = roleFromTemplate(t, []);
      expect(Object.keys(role.fields)).toEqual(['currentTitle']);
    }
  });
});

describe('pickRole', () => {
  it.each([
    ['Full Stack Developer (React/Laravel)', 'Full Stack Developer'],
    ['Senior React Developer', 'Frontend Developer'],
    ['Backend Engineer – Node.js', 'Backend Developer'],
    ['Analista de Datos Jr', 'Data Analyst'],
    ['Power BI Developer', 'BI Developer'],
    ['Salesforce CRM Specialist', 'CRM Specialist'],
    ['Desarrollador Front-End', 'Frontend Developer'],
  ])('%s -> %s', (title, expected) => {
    expect(name(title)).toBe(expected);
  });

  it('uses the default role when no keyword matches, or none if there is no default', () => {
    expect(name('Software Engineer')).toBe('Full Stack Developer');
    expect(pickRole('Software Engineer', { ...state, defaultId: '' }).role).toBeNull();
  });

  it('matches whole words only ("reactive" is not "react")', () => {
    expect(pickRole('Reactive Systems Engineer', { ...state, defaultId: '' }).role).toBeNull();
  });
});

describe('profileForRole', () => {
  const base: Profile = { ...EMPTY_PROFILE, firstName: 'Ana', currentTitle: 'Developer', summary: 'Base summary', portfolio: 'https://ana.dev' };

  it('uses the role fields and keeps the base for the rest', () => {
    const role = { ...state.list[1], fields: { currentTitle: 'Frontend Developer', summary: 'React and Angular' } };
    const p = profileForRole(base, role);
    expect(p).toMatchObject({ firstName: 'Ana', currentTitle: 'Frontend Developer', summary: 'React and Angular', portfolio: 'https://ana.dev' });
    expect([...roleOverrides(role)]).toEqual(['currentTitle', 'summary']);
  });

  it('empty role fields use the base', () => {
    const role = { ...state.list[1], fields: { summary: '  ' } };
    expect(profileForRole(base, role).summary).toBe('Base summary');
    expect(profileForRole(base, null)).toBe(base);
  });
});

describe('answersForRole', () => {
  const answers: SavedAnswer[] = [
    { id: '1', question: 'Why us?', answer: 'general', updatedAt: '' },
    { id: '2', question: 'Why frontend?', answer: 'front', updatedAt: '', roleId: 'frontend-developer' },
    { id: '3', question: 'Why data?', answer: 'data', updatedAt: '', roleId: 'data-analyst' },
  ];
  it('returns general answers + answers of the role', () => {
    expect(answersForRole(answers, 'frontend-developer').map((a) => a.id)).toEqual(['1', '2']);
    expect(answersForRole(answers, undefined).map((a) => a.id)).toEqual(['1']);
  });
});

describe('roles in backups', () => {
  it('keeps your roles and cleans unsafe values', () => {
    const backup = parseBackup(
      JSON.stringify({
        roles: {
          defaultId: 'missing',
          list: [
            { id: 'x', name: 'Frontend', keywords: [' React ', 'react', 42], fields: { summary: 'Hi', portfolio: 'javascript:alert(1)', isAdmin: 'yes' } },
            { id: 'x', name: '', keywords: 'not a list' },
          ],
        },
      }),
    );
    const [first, second] = backup.roles!.list;
    expect(first).toEqual({ id: 'x', name: 'Frontend', keywords: ['react'], fields: { summary: 'Hi' } });
    expect(second.id).toBe('x-2'); // ids stay unique
    expect(second.name).toBe('Role');
    expect(backup.roles!.defaultId).toBe(''); // unknown default is dropped
  });

  it('parseKeywords trims, lowercases and removes duplicates', () => {
    expect(parseKeywords('Frontend, React,react , ,vue')).toEqual(['frontend', 'react', 'vue']);
  });
});
