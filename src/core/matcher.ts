import { normalize, splitCamel, tokens } from './normalize';
import { AUTOCOMPLETE_MAP, SKIP_INPUT_TYPES, TEXT_RULES } from './rules';
import type { FieldDescriptor, FieldKey, Profile, SavedAnswer } from './types';

export function shouldSkip(field: FieldDescriptor): boolean {
  return field.tag === 'input' && SKIP_INPUT_TYPES.has(field.type);
}

/** Find which profile key a field asks for, or null if we don't know. */
export function matchField(field: FieldDescriptor): FieldKey | null {
  if (shouldSkip(field)) return null;

  // 1. Strong signals: input type and autocomplete.
  if (field.type === 'email') return 'email';
  if (field.type === 'tel') return 'phone';
  const auto = field.autocomplete.toLowerCase().split(' ').pop() ?? '';
  if (auto && AUTOCOMPLETE_MAP[auto]) return AUTOCOMPLETE_MAP[auto];

  // 2. Text signals. The visible label is what the human reads, so try it first.
  // nearbyText goes last: a page can easily fake it (security fix #6).
  const candidates = [field.label, field.ariaLabel, field.placeholder, splitCamel(field.name), splitCamel(field.id), field.nearbyText ?? '']
    .map(normalize)
    .filter(Boolean);

  for (const text of candidates) {
    for (const rule of TEXT_RULES) {
      if (rule.patterns.some((p) => p.test(text))) return rule.key;
    }
  }
  return null;
}

export function valueFor(key: FieldKey, profile: Profile): string {
  if (key === 'fullName') return `${profile.firstName} ${profile.lastName}`.trim();
  return profile[key] ?? '';
}

/** Similarity between two questions: share of words they have in common (Jaccard index). */
export function similarity(a: string, b: string): number {
  const setA = new Set(tokens(a));
  const setB = new Set(tokens(b));
  if (!setA.size || !setB.size) return 0;
  let common = 0;
  for (const t of setA) if (setB.has(t)) common++;
  return common / (setA.size + setB.size - common);
}

/**
 * Minimum similarity to suggest a saved answer. Raised from 0.3 (security fix #3).
 * The main protection is that answers are never filled without your tick in the popup.
 */
export const ANSWER_THRESHOLD = 0.4;

/** Pick the saved answer whose question looks most like this one. */
export function bestAnswer(question: string, answers: SavedAnswer[]): { answer: SavedAnswer; score: number } | null {
  let best: { answer: SavedAnswer; score: number } | null = null;
  for (const answer of answers) {
    const score = similarity(question, answer.question);
    if (!best || score > best.score) best = { answer, score };
  }
  return best && best.score >= ANSWER_THRESHOLD ? best : null;
}

/** Choose the <option> that matches a value ("Mexico" matches "México (MX)"). */
export function pickOption(options: { value: string; text: string }[], wanted: string): string | null {
  const target = normalize(wanted);
  if (!target) return null;
  const exact = options.find((o) => normalize(o.text) === target || normalize(o.value) === target);
  if (exact) return exact.value;
  const partial = options.find((o) => {
    const text = normalize(o.text);
    return text.length > 1 && (text.includes(target) || target.includes(text));
  });
  return partial ? partial.value : null;
}

/** Guess the company from the page, e.g. "Jobs at Acme" or the ATS URL "boards.greenhouse.io/acme/jobs/1". */
export function guessCompany(url: string, title: string): string {
  try {
    const u = new URL(url);
    // Company in the subdomain: acme.workable.com, acme.breezy.hr
    const sub = u.hostname.match(/^([a-z0-9-]+)\.(workable\.com|breezy\.hr|recruitee\.com|bamboohr\.com)$/);
    if (sub && !['apply', 'jobs', 'www'].includes(sub[1])) return capitalize(sub[1].replace(/-/g, ' '));
    // Company in the path: boards.greenhouse.io/acme, jobs.lever.co/acme, jobs.ashbyhq.com/acme
    const ats = /(greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com)$/;
    const first = u.pathname.split('/').filter(Boolean)[0];
    if (ats.test(u.hostname) && first && first.length > 1) return capitalize(first.replace(/-/g, ' '));
  } catch {
    /* not a valid URL, fall back to title */
  }
  const at = title.match(/\bat ([^|\-–]+)/i) || title.match(/\ben ([^|\-–]+)/i);
  if (at) return at[1].trim();
  return title.split(/[|\-–]/).pop()?.trim() ?? '';
}

function capitalize(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}
