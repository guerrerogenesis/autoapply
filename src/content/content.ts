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
export interface AutoApplyApi {
  frameInfo(): FrameInfo;
  plan(profile: Profile, answers: SavedAnswer[], overwrite: boolean): FillPlan;
  apply(refs: number[]): FillReport;
  collect(): { question: string; answer: string }[];
}

declare global {
  interface Window {
    __autoapply?: AutoApplyApi;
  }
}

function topOrigin(): string {
  if (window === window.top) return location.origin;
  // Chrome: the origins of all parent frames, the last one is the top page.
  const ancestors = location.ancestorOrigins;
  return ancestors?.length ? ancestors[ancestors.length - 1] : 'unknown';
}

window.__autoapply ??= {
  frameInfo: () => classifyFrame(window === window.top, location.origin, topOrigin()),
  plan: (profile, answers, overwrite) => planFill(document, profile, answers, { overwrite }),
  apply: (refs) => applyFill(refs),
  collect: () => collectAnswers(document),
};
