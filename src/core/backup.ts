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
    }))
    .filter((a) => a.question && a.answer);
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
  if (!isObject(data)) throw new Error('This file is not an AutoApply backup.');
  const backup: Backup = {
    profile: cleanProfile(data.profile),
    answers: cleanAnswers(data.answers),
    applications: cleanApplications(data.applications),
  };
  if (!backup.profile && !backup.answers && !backup.applications) throw new Error('This file is not an AutoApply backup.');
  return backup;
}
