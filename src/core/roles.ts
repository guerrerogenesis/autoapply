import { normalize } from './normalize';
import type { Profile, SavedAnswer } from './types';

/**
 * Roles: versions of you for different kinds of jobs (Full Stack, Frontend, Data Analyst…).
 * Your base profile (name, email, phone, links…) is shared. A role only changes a few fields.
 * Empty role fields use the base profile.
 */
export const ROLE_FIELDS = ['currentTitle', 'summary', 'yearsExperience', 'salaryExpectation', 'portfolio'] as const;
export type RoleField = (typeof ROLE_FIELDS)[number];

export interface Role {
  id: string;
  name: string;
  /** Words in a job title that select this role, e.g. "react", "frontend". */
  keywords: string[];
  fields: Partial<Record<RoleField, string>>;
}

export interface RolesState {
  list: Role[];
  /** Used when no keyword matches the job title. Empty = use only the base profile. */
  defaultId: string;
}

/**
 * Every user starts WITHOUT roles: Sabi works with the base profile only.
 * Each person creates the roles they need, from a template or from scratch.
 */
export const DEFAULT_ROLES: RolesState = { list: [], defaultId: '' };

export interface RoleTemplate {
  name: string;
  keywords: string[];
}

/**
 * Generic starting points shown in "+ New role". Only the name and the keywords:
 * the summary, years and salary are always written by the user.
 */
export const ROLE_TEMPLATES: RoleTemplate[] = [
  { name: 'Full Stack Developer', keywords: ['full stack', 'fullstack', 'full-stack'] },
  { name: 'Frontend Developer', keywords: ['frontend', 'front end', 'front-end', 'react', 'vue', 'angular', 'ui developer'] },
  { name: 'Backend Developer', keywords: ['backend', 'back end', 'back-end', 'api developer', 'node', 'php', 'python developer', 'java developer'] },
  { name: 'Mobile Developer', keywords: ['mobile', 'ios', 'android', 'react native', 'flutter'] },
  { name: 'DevOps Engineer', keywords: ['devops', 'sre', 'site reliability', 'platform engineer', 'cloud engineer'] },
  { name: 'QA Engineer', keywords: ['qa', 'quality assurance', 'test engineer', 'automation tester', 'sdet'] },
  { name: 'Data Analyst', keywords: ['data analyst', 'data analysis', 'analista de datos', 'analytics'] },
  { name: 'Data Engineer', keywords: ['data engineer', 'etl', 'data pipeline'] },
  { name: 'BI Developer', keywords: ['bi developer', 'business intelligence', 'power bi', 'tableau', 'looker', 'bi analyst'] },
  { name: 'CRM Specialist', keywords: ['crm', 'salesforce', 'hubspot', 'zoho', 'dynamics 365'] },
  { name: 'UX/UI Designer', keywords: ['ux', 'ui designer', 'product designer', 'ux designer', 'disenador ux'] },
  { name: 'Project Manager', keywords: ['project manager', 'scrum master', 'product owner', 'delivery manager'] },
];

export function roleFromTemplate(template: RoleTemplate | null, taken: string[]): Role {
  const name = template?.name ?? 'New role';
  return {
    id: slugId(name, taken),
    name,
    keywords: template ? [...template.keywords] : [],
    fields: template ? { currentTitle: template.name } : {},
  };
}

/**
 * Pick the role for a job title.
 * The keyword that appears FIRST in the title wins, because titles start with the main role:
 * "Full Stack Developer (React/Laravel)" -> Full Stack, not Frontend or Backend.
 * Same position: the longer keyword wins ("power bi" over "bi").
 */
export function pickRole(jobTitle: string, state: RolesState): { role: Role | null; matched: string | null } {
  const title = ` ${normalize(jobTitle)} `;
  let best: { role: Role; keyword: string; index: number } | null = null;
  for (const role of state.list) {
    for (const raw of role.keywords) {
      const keyword = normalize(raw);
      if (!keyword) continue;
      const index = title.indexOf(` ${keyword} `);
      if (index === -1) continue;
      if (!best || index < best.index || (index === best.index && keyword.length > best.keyword.length)) {
        best = { role, keyword, index };
      }
    }
  }
  if (best) return { role: best.role, matched: best.keyword };
  // No keyword matched: the default role, or none (base profile only).
  return { role: state.list.find((r) => r.id === state.defaultId) ?? null, matched: null };
}

/** Base profile + the role's non-empty fields. */
export function profileForRole(base: Profile, role: Role | null | undefined): Profile {
  if (!role) return base;
  const merged = { ...base };
  for (const key of ROLE_FIELDS) {
    const value = role.fields[key]?.trim();
    if (value) merged[key] = value;
  }
  return merged;
}

/** Which fields come from the role (for the popup preview: "Summary ← Frontend"). */
export function roleOverrides(role: Role | null | undefined): Set<RoleField> {
  return new Set(ROLE_FIELDS.filter((key) => role?.fields[key]?.trim()));
}

/** General answers (no role) + the answers of this role. */
export function answersForRole(answers: SavedAnswer[], roleId: string | undefined): SavedAnswer[] {
  return answers.filter((a) => !a.roleId || a.roleId === roleId);
}

/** "frontend, React,  vue " -> ["frontend", "react", "vue"] */
export function parseKeywords(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 30);
}

export function slugId(name: string, taken: string[]): string {
  const base = normalize(name).replace(/\s+/g, '-').slice(0, 30) || 'role';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}
