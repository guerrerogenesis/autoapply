import { EMPTY_PROFILE, type Application, type Profile, type SavedAnswer } from './types';

/** Thin typed wrapper over chrome.storage.local. All data stays on your computer. */
interface Store {
  profile: Profile;
  answers: SavedAnswer[];
  applications: Application[];
}

const DEFAULTS: Store = { profile: EMPTY_PROFILE, answers: [], applications: [] };

export async function load<K extends keyof Store>(key: K): Promise<Store[K]> {
  const data = await chrome.storage.local.get(key);
  const value = data[key] as Store[K] | undefined;
  if (key === 'profile') return { ...EMPTY_PROFILE, ...(value as Profile | undefined) } as Store[K];
  return value ?? DEFAULTS[key];
}

export async function save<K extends keyof Store>(key: K, value: Store[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function exportAll(): Promise<Store> {
  return { profile: await load('profile'), answers: await load('answers'), applications: await load('applications') };
}

export async function importAll(data: Partial<Store>): Promise<void> {
  if (data.profile) await save('profile', { ...EMPTY_PROFILE, ...data.profile });
  if (Array.isArray(data.answers)) await save('answers', data.answers);
  if (Array.isArray(data.applications)) await save('applications', data.applications);
}

export function newId(): string {
  return crypto.randomUUID();
}
