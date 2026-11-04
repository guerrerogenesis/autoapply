import { bestAnswer, matchField, pickOption, shouldSkip, valueFor } from '../core/matcher';
import type { FieldDescriptor, FillReport, Profile, SavedAnswer } from '../core/types';

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const HIGHLIGHT = 'outline: 2px solid #7c5cff; outline-offset: 1px; background-color: #f4f1ff;';

/** Find the text a human sees for this field. */
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

  // Fallback: walk up a few levels and use the first text block before the field
  // (common in Lever, Workable and custom forms).
  let node: Element | null = el;
  for (let depth = 0; depth < 3 && node; depth++) {
    let prev = node.previousElementSibling;
    while (prev) {
      const text = prev.textContent?.trim();
      if (text && text.length < 200) return clean(text);
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
  };
}

function isVisible(el: HTMLElement): boolean {
  if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return !style || (style.display !== 'none' && style.visibility !== 'hidden');
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

export function fields(root: Document | HTMLElement): FormField[] {
  return Array.from(root.querySelectorAll<FormField>('input, textarea, select')).filter(
    (el) => !el.disabled && !(el as HTMLInputElement).readOnly && isVisible(el),
  );
}

export function fillPage(
  root: Document | HTMLElement,
  profile: Profile,
  answers: SavedAnswer[],
  options: { overwrite?: boolean } = {},
): FillReport {
  const report: FillReport = { filled: 0, answered: 0, skipped: 0, fields: [] };

  for (const el of fields(root)) {
    const desc = describe(el);
    if (shouldSkip(desc)) continue;
    if (el.value && !options.overwrite) {
      report.skipped++;
      continue;
    }

    const key = matchField(desc);
    let value = key ? valueFor(key, profile) : '';
    let source = key ?? '';

    // Open questions: use the most similar saved answer.
    if (!value && el instanceof HTMLTextAreaElement && desc.label) {
      const match = bestAnswer(desc.label, answers);
      if (match) {
        value = match.answer.answer;
        source = `answer: ${match.answer.question}`;
      }
    }
    if (!value) continue;

    if (el instanceof HTMLSelectElement) {
      const optionValue = pickOption(
        Array.from(el.options).map((o) => ({ value: o.value, text: o.text })),
        value,
      );
      if (!optionValue) continue;
      value = optionValue;
    }

    setValue(el, value);
    el.setAttribute('style', `${el.getAttribute('style') ?? ''};${HIGHLIGHT}`);
    el.dataset.autoapply = 'filled';
    if (source.startsWith('answer:')) report.answered++;
    else report.filled++;
    report.fields.push({ label: desc.label || desc.name || desc.id, source });
  }
  return report;
}

/** Collect the long answers you typed on this page, so you can save them for next time. */
export function collectAnswers(root: Document | HTMLElement): { question: string; answer: string }[] {
  return Array.from(root.querySelectorAll('textarea'))
    .filter((el) => el.dataset.autoapply !== 'filled' && el.value.trim().length >= 40)
    .map((el) => ({ question: labelOf(el), answer: el.value.trim() }))
    .filter((item) => item.question.length > 0);
}
