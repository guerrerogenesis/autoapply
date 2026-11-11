import { parseKeywords, ROLE_FIELDS, type Role, type RolesState } from './roles';
import { cleanText, safeHref } from './sanitize';
import { EMPTY_PROFILE, type Application, type ApplicationStatus, type Profile, type SavedAnswer } from './types';

/**
 * Security fix #9: never trust an imported backup file.
 * Only known fields are kept, every value is a string with a max length,
 * URLs must be http(s), and lists have a max size.
 */
const STATUSES: ApplicationStatus[] = ['applied', 'interview', 'offer', 'rejected', 'ghosted'];
const MAX_ITEMS = 20_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface Backup {
  profile?: Profile;
  roles?: RolesState;
  answers?: SavedAnswer[];
  applications?: Application[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function cleanProfile(raw: unknown): Profile | undefined {
  if (!isObject(raw)) return undefined;
  const profile = { ...EMPTY_PROFILE };
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof Profile)[]) {
    profile[key] = cleanText(raw[key], key === 'summary' ? 5000 : 500);
  }
  return profile;
}

function cleanAnswers(raw: unknown): SavedAnswer[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .slice(0, MAX_ITEMS)
    .filter(isObject)
    .map((a) => ({
      id: cleanText(a.id, 100) || crypto.randomUUID(),
      question: cleanText(a.question, 300),
      answer: cleanText(a.answer, 5000),
      updatedAt: cleanText(a.updatedAt, 40),
      ...(cleanText(a.roleId, 60) ? { roleId: cleanText(a.roleId, 60) } : {}),
    }))
    .filter((a) => a.question && a.answer);
}

function uniqueId(id: string, ids: Set<string>): string {
  let unique = id;
  for (let n = 2; ids.has(unique); n++) unique = `${id}-${n}`;
  ids.add(unique);
  return unique;
}

function cleanRoles(raw: unknown): RolesState | undefined {
  if (!isObject(raw) || !Array.isArray(raw.list)) return undefined;
  const ids = new Set<string>();
  const list: Role[] = raw.list
    .slice(0, 30)
    .filter(isObject)
    .map((r) => {
      const fields: Role['fields'] = {};
      const rawFields = isObject(r.fields) ? r.fields : {};
      for (const key of ROLE_FIELDS) {
        let value = cleanText(rawFields[key], key === 'summary' ? 5000 : 500);
        if (key === 'portfolio') value = safeHref(value) ?? ''; // unsafe links are dropped
        if (value) fields[key] = value;
      }
      return {
        id: uniqueId(cleanText(r.id, 60) || crypto.randomUUID(), ids),
        name: cleanText(r.name, 80) || 'Role',
        keywords: parseKeywords(Array.isArray(r.keywords) ? r.keywords.map((k) => cleanText(k, 60)).join(',') : ''),
        fields,
      };
    });
  if (!list.length) return { list: [], defaultId: '' };
  const defaultId = cleanText(raw.defaultId, 60);
  return { list, defaultId: list.some((r) => r.id === defaultId) ? defaultId : '' };
}

function cleanApplications(raw: unknown): Application[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw
    .slice(0, MAX_ITEMS)
    .filter(isObject)
    .map((a) => {
      const external: Application['external'] = {};
      if (isObject(a.external)) {
        for (const [sink, ref] of Object.entries(a.external).slice(0, 10)) {
          if (isObject(ref)) external[cleanText(sink, 30)] = { id: cleanText(ref.id, 100), url: safeHref(cleanText(ref.url, 2000)) ?? '' };
        }
      }
      const date = cleanText(a.appliedAt, 40);
      return {
        id: cleanText(a.id, 100) || crypto.randomUUID(),
        company: cleanText(a.company, 200),
        role: cleanText(a.role, 300),
        url: safeHref(cleanText(a.url, 2000)) ?? '',
        appliedAt: Number.isNaN(Date.parse(date)) ? new Date().toISOString() : date,
        status: STATUSES.includes(a.status as ApplicationStatus) ? (a.status as ApplicationStatus) : 'applied',
        notes: cleanText(a.notes, 2000),
        ...(cleanText(a.profile, 80) ? { profile: cleanText(a.profile, 80) } : {}),
        ...(Object.keys(external).length ? { external } : {}),
      };
    });
}

/** Parse and clean a backup file. Throws a clear error if it is not valid. */
export function parseBackup(text: string): Backup {
  if (text.length > MAX_FILE_BYTES) throw new Error('The file is too big.');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isObject(data)) throw new Error('This file is not a Sabi backup.');
  const backup: Backup = {
    profile: cleanProfile(data.profile),
    roles: cleanRoles(data.roles),
    answers: cleanAnswers(data.answers),
    applications: cleanApplications(data.applications),
  };
  if (!backup.profile && !backup.roles && !backup.answers && !backup.applications) throw new Error('This file is not a Sabi backup.');
  return backup;
}
