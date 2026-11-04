import { bestAnswer, matchField, pickOption, shouldSkip, valueFor } from '../core/matcher';
import type { FieldDescriptor, FillPlan, FillReport, PlanItem, Profile, SavedAnswer } from '../core/types';
import { isUserVisible } from './visibility';

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const HIGHLIGHT = 'outline: 2px solid #7c5cff; outline-offset: 1px; background-color: #f4f1ff;';
const MAX_VALUE_LENGTH = 5000;

/**
 * The label a human reads, from explicit markup only:
 * <label for>, a wrapping <label>, or aria-labelledby.
 * (Security fix #6: guessed nearby text is no longer used here, see nearbyText.)
 */
export function labelOf(el: FormField): string {
  const doc = el.ownerDocument;
  if (el.id) {
    const forLabel = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel?.textContent?.trim()) return clean(forLabel.textContent);
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent?.trim()) return clean(wrapping.textContent);

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(' ')
      .map((id) => doc.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (text.trim()) return clean(text);
  }
  return '';
}

/**
 * Last resort: the first text block before the field (Lever, Workable, custom forms).
 * It is easy for a page to fake, so the matcher only uses it after aria-label,
 * placeholder, name and id.
 */
export function nearbyText(el: FormField): string {
  let node: Element | null = el;
  for (let depth = 0; depth < 3 && node; depth++) {
    let prev = node.previousElementSibling;
    while (prev) {
      const text = prev.textContent?.trim();
      if (text && text.length < 200 && !prev.querySelector('input, textarea, select')) return clean(text);
      prev = prev.previousElementSibling;
    }
    node = node.parentElement;
  }
  return '';
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\*/g, '').trim();
}

export function describe(el: FormField): FieldDescriptor {
  return {
    tag: el.tagName.toLowerCase() as FieldDescriptor['tag'],
    type: (el.getAttribute('type') ?? (el instanceof HTMLSelectElement ? 'select' : 'text')).toLowerCase(),
    name: el.getAttribute('name') ?? '',
    id: el.id,
    placeholder: el.getAttribute('placeholder') ?? '',
    autocomplete: el.getAttribute('autocomplete') ?? '',
    ariaLabel: el.getAttribute('aria-label') ?? '',
    label: labelOf(el),
    nearbyText: nearbyText(el),
  };
}

/**
 * Set a value the way a user would. React, Vue and Angular listen to events,
 * so we use the native setter and fire input + change + blur.
 */
export function setValue(el: FormField, value: string): void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}

function editableFields(root: Document | HTMLElement): FormField[] {
  return Array.from(root.querySelectorAll<FormField>('input, textarea, select')).filter(
    (el) => !el.disabled && !(el as HTMLInputElement).readOnly,
  );
}

/** Pending plan in this frame: ref -> element + value. Kept until the user confirms. */
const pending = new Map<number, { el: FormField; value: string; kind: PlanItem['kind'] }>();
let nextRef = 1;

/**
 * Step 1 (security fix #1 and #3): decide what WOULD be filled, without touching the page.
 * The popup shows this list and you confirm it.
 * - Hidden fields are ignored and counted.
 * - Saved answers are only suggested (not selected by default).
 */
export function planFill(
  root: Document | HTMLElement,
  profile: Profile,
  answers: SavedAnswer[],
  options: { overwrite?: boolean } = {},
): FillPlan {
  pending.clear();
  const plan: FillPlan = { items: [], skipped: 0, hidden: 0 };

  for (const el of editableFields(root)) {
    const desc = describe(el);
    if (shouldSkip(desc)) continue;

    const key = matchField(desc);
    let value = key ? valueFor(key, profile) : '';
    let source = key ?? '';
    let kind: PlanItem['kind'] = 'profile';

    if (!value && el instanceof HTMLTextAreaElement) {
      const question = desc.label || desc.ariaLabel || desc.placeholder || desc.nearbyText;
      const match = question ? bestAnswer(question, answers) : null;
      if (match) {
        value = match.answer.answer;
        source = match.answer.question;
        kind = 'answer';
      }
    }
    if (!value) continue;

    // Count hidden fields that tried to get data, so the popup can warn you.
    if (!isUserVisible(el)) {
      plan.hidden++;
      continue;
    }
    if (el.value && !options.overwrite) {
      plan.skipped++;
      continue;
    }

    if (el instanceof HTMLSelectElement) {
      const optionValue = pickOption(
        Array.from(el.options).map((o) => ({ value: o.value, text: o.text })),
        value,
      );
      if (!optionValue) continue;
      value = optionValue;
    }

    const ref = nextRef++;
    pending.set(ref, { el, value: value.slice(0, MAX_VALUE_LENGTH), kind });
    plan.items.push({
      ref,
      label: desc.label || desc.ariaLabel || desc.placeholder || desc.nearbyText || desc.name || desc.id,
      source,
      kind,
      selected: kind === 'profile',
    });
  }
  return plan;
}

/** Step 2: fill only the fields you confirmed. Refs not in the current plan are ignored. */
export function applyFill(refs: number[]): FillReport {
  const report: FillReport = { filled: 0, answered: 0, skipped: 0, fields: [] };
  for (const ref of refs) {
    const item = pending.get(ref);
    // Re-check: the page could have hidden or replaced the field after the preview.
    if (!item || !item.el.isConnected || !isUserVisible(item.el)) {
      report.skipped++;
      continue;
    }
    setValue(item.el, item.value);
    item.el.setAttribute('style', `${item.el.getAttribute('style') ?? ''};${HIGHLIGHT}`);
    item.el.dataset.autoapply = 'filled';
    if (item.kind === 'answer') report.answered++;
    else report.filled++;
    report.fields.push({ label: labelOf(item.el) || item.el.name || item.el.id, source: item.kind });
  }
  pending.clear();
  return report;
}

/** Plan + apply in one call. Used by tests; answers are only filled when asked. */
export function fillPage(
  root: Document | HTMLElement,
  profile: Profile,
  answers: SavedAnswer[],
  options: { overwrite?: boolean; includeAnswers?: boolean } = {},
): FillReport & { hidden: number } {
  const plan = planFill(root, profile, answers, options);
  const refs = plan.items.filter((i) => i.selected || (options.includeAnswers && i.kind === 'answer')).map((i) => i.ref);
  const report = applyFill(refs);
  return { ...report, skipped: report.skipped + plan.skipped, hidden: plan.hidden };
}

/**
 * Collect the long answers YOU typed on this page, so you can save them for next time.
 * Text the page put there itself (defaultValue) or hidden textareas are ignored,
 * so a page cannot plant answers in your list.
 */
export function collectAnswers(root: Document | HTMLElement): { question: string; answer: string }[] {
  return Array.from(root.querySelectorAll('textarea'))
    .filter((el) => el.dataset.autoapply !== 'filled' && el.value !== el.defaultValue && isUserVisible(el))
    .filter((el) => el.value.trim().length >= 40)
    .map((el) => ({
      question: (labelOf(el) || el.getAttribute('aria-label') || nearbyText(el)).slice(0, 300),
      answer: el.value.trim().slice(0, MAX_VALUE_LENGTH),
    }))
    .filter((item) => item.question.length > 0);
}
