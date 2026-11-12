import { classifyFrame, type FrameInfo } from '../core/frames';
import type { FillPlan, FillReport, Profile, SavedAnswer } from '../core/types';
import { applyFill, collectAnswers, planFill } from './dom';

/**
 * Injected on demand by the popup (activeTab + scripting).
 *
 * Security (fix #4): this script never reads extension storage. The popup sends the
 * profile and answers as arguments, and only to trusted frames (fix #2).
 * So code running in a job page has no path to your ClickUp token or Sheets secret.
 */
export interface SabiApi {
  frameInfo(): FrameInfo;
  plan(profile: Profile, answers: SavedAnswer[], overwrite: boolean): FillPlan;
  apply(refs: number[]): FillReport;
  collect(): { question: string; answer: string }[];
}

declare global {
  interface Window {
    __sabi?: SabiApi;
  }
}

/**
 * Origin of the top page, seen from this frame.
 * 1. Same-origin parent: we can read it directly (works in every browser).
 * 2. Chrome and Firefox 148+: location.ancestorOrigins lists the parents' origins.
 * 3. Otherwise 'unknown', so the frame is treated as third-party (the safe choice).
 */
export function topOrigin(win: Window = window): string {
  if (win === win.top) return win.location.origin;
  try {
    const origin = win.top?.location.origin; // throws for a cross-origin parent
    if (origin) return origin;
  } catch {
    /* cross-origin parent: try ancestorOrigins */
  }
  const ancestors = win.location.ancestorOrigins;
  return ancestors?.length ? ancestors[ancestors.length - 1] : 'unknown';
}

window.__sabi ??= {
  frameInfo: () => classifyFrame(window === window.top, location.origin, topOrigin()),
  plan: (profile, answers, overwrite) => planFill(document, profile, answers, { overwrite }),
  apply: (refs) => applyFill(refs),
  collect: () => collectAnswers(document),
};
