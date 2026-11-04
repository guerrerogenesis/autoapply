/**
 * Which frames of a page may receive your data (security fix #2).
 * - the top page (the job page you opened)
 * - iframes from the same origin as the top page
 * - iframes from known job platforms (an embedded Greenhouse/Lever form on a company site)
 * Everything else (ads, chat widgets, trackers) never gets your profile.
 */
export const KNOWN_ATS_DOMAINS = [
  'greenhouse.io',
  'lever.co',
  'workable.com',
  'ashbyhq.com',
  'smartrecruiters.com',
  'myworkdayjobs.com',
  'myworkdaysite.com',
  'bamboohr.com',
  'recruitee.com',
  'breezy.hr',
  'jobvite.com',
  'icims.com',
  'teamtailor.com',
  'getonbrd.com',
  'personio.de',
  'personio.com',
  'applytojob.com',
  'jazzhr.com',
  'pinpointhq.com',
  'rippling-ats.com',
  'dover.com',
];

export function isKnownAts(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== 'https:') return false;
    return KNOWN_ATS_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

export interface FrameInfo {
  isTop: boolean;
  origin: string;
  topOrigin: string;
  trusted: boolean;
  reason: 'top' | 'same-origin' | 'known-ats' | 'third-party';
}

export function classifyFrame(isTop: boolean, origin: string, topOrigin: string): FrameInfo {
  const base = { isTop, origin, topOrigin };
  if (isTop) return { ...base, trusted: true, reason: 'top' };
  if (origin !== 'null' && origin === topOrigin) return { ...base, trusted: true, reason: 'same-origin' };
  if (isKnownAts(origin)) return { ...base, trusted: true, reason: 'known-ats' };
  return { ...base, trusted: false, reason: 'third-party' };
}
