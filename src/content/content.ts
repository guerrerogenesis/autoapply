import { load } from '../core/storage';
import type { FillReport } from '../core/types';
import { collectAnswers, fillPage } from './dom';

/**
 * Injected on demand by the popup (activeTab + scripting) in every frame of the tab,
 * so the extension never reads pages you don't ask it to. Many ATS forms
 * (e.g. Greenhouse embeds) live inside an iframe, that is why we use all frames.
 */
export interface AutoApplyApi {
  fill(overwrite: boolean): Promise<FillReport>;
  collect(): { question: string; answer: string }[];
}

declare global {
  interface Window {
    __autoapply?: AutoApplyApi;
  }
}

window.__autoapply ??= {
  async fill(overwrite) {
    const [profile, answers] = await Promise.all([load('profile'), load('answers')]);
    return fillPage(document, profile, answers, { overwrite });
  },
  collect() {
    return collectAnswers(document);
  },
};
