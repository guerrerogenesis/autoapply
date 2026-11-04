import type { Backup } from './backup';
import type { ApplicationRepository } from './sinks/local-sink';
import { DEFAULT_SETTINGS, withDefaults, type Settings } from './sinks/types';
import { EMPTY_PROFILE, type Application, type Profile, type SavedAnswer } from './types';

/** Thin typed wrapper over chrome.storage.local. All data stays on your computer. */
interface Store {
  profile: Profile;
  answers: SavedAnswer[];
  applications: Application[];
  settings: Settings;
}

const DEFAULTS: Store = { profile: EMPTY_PROFILE, answers: [], applications: [], settings: DEFAULT_SETTINGS };

export async function load<K extends keyof Store>(key: K): Promise<Store[K]> {
  const data = await chrome.storage.local.get(key);
  const value = data[key] as Store[K] | undefined;
  if (key === 'profile') return { ...EMPTY_PROFILE, ...(value as Profile | undefined) } as Store[K];
  if (key === 'settings') return withDefaults(value as Settings | undefined) as Store[K];
  return value ?? DEFAULTS[key];
}

export async function save<K extends keyof Store>(key: K, value: Store[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/** chrome.storage implementation of the repository used by LocalSink. */
export const applicationRepository: ApplicationRepository = {
  list: () => load('applications'),
  saveAll: (applications) => save('applications', applications),
};

/**
 * Backup without secrets: the ClickUp token is not exported,
 * so you can share or upload the JSON safely.
 */
export async function exportAll(): Promise<Omit<Store, 'settings'>> {
  return { profile: await load('profile'), answers: await load('answers'), applications: await load('applications') };
}

/** Import a backup that was already cleaned by parseBackup() (security fix #9). */
export async function importAll(data: Backup): Promise<void> {
  if (data.profile) await save('profile', { ...EMPTY_PROFILE, ...data.profile });
  if (data.answers) await save('answers', data.answers);
  if (data.applications) await save('applications', data.applications);
}

export function newId(): string {
  return crypto.randomUUID();
}
