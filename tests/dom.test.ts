// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { collectAnswers, fillPage } from '../src/content/dom';
import { EMPTY_PROFILE, type Profile, type SavedAnswer } from '../src/core/types';

const profile: Profile = {
  ...EMPTY_PROFILE,
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@example.com',
  phone: '+52 322 000 0000',
  city: 'Puerto Vallarta',
  country: 'Mexico',
  linkedin: 'https://linkedin.com/in/ana',
  github: 'https://github.com/ana',
  portfolio: 'https://ana.dev',
  currentCompany: 'Indie',
  yearsExperience: '6',
  salaryExpectation: '3000 USD',
  englishLevel: 'B1',
};

const answers: SavedAnswer[] = [
  { id: '1', question: 'Why do you want to work here?', answer: 'I like remote product teams.', updatedAt: '' },
];

const html = readFileSync(resolve(__dirname, '../demo/demo-form.html'), 'utf8');
const value = (selector: string) => (document.querySelector(selector) as HTMLInputElement).value;

beforeEach(() => {
  document.documentElement.innerHTML = html.replace(/^<!doctype html>/i, '');
});

describe('fillPage on the demo form', () => {
  it('fills profile fields in English and Spanish', () => {
    const report = fillPage(document, profile, answers);
    expect(value('#first_name')).toBe('Ana');
    expect(value('#last_name')).toBe('Pérez');
    expect(value('#email')).toBe('ana@example.com');
    expect(value('#phone')).toBe('+52 322 000 0000');
    expect(value('#li')).toBe('https://linkedin.com/in/ana');
    expect(value('#gh')).toBe('https://github.com/ana');
    expect(value('[name="name"]')).toBe('Ana Pérez');
    expect(value('[name="org"]')).toBe('Indie');
    expect(value('[name="urls[Portfolio]"]')).toBe('https://ana.dev');
    expect(value('[name="ciudad"]')).toBe('Puerto Vallarta');
    expect(value('#pais')).toBe('MX');
    expect(value('#exp')).toBe('6');
    expect(value('#sal')).toBe('3000 USD');
    expect(value('#eng')).toBe('B1');
    expect(report.filled).toBe(14);
  });

  it('suggests saved answers but only fills them when you tick them (security fix #3)', () => {
    expect(fillPage(document, profile, answers).answered).toBe(0);
    expect(value('#q1')).toBe('');

    const report = fillPage(document, profile, answers, { includeAnswers: true });
    expect(value('#q1')).toBe('I like remote product teams.');
    expect(value('#q2')).toBe('');
    expect(report.answered).toBe(1);
  });

  it('does not replace text you already wrote, unless asked', () => {
    (document.querySelector('#email') as HTMLInputElement).value = 'other@mail.com';
    expect(fillPage(document, profile, answers).skipped).toBe(1);
    expect(value('#email')).toBe('other@mail.com');
    fillPage(document, profile, answers, { overwrite: true });
    expect(value('#email')).toBe('ana@example.com');
  });

  it('fires input events so React/Vue/Angular see the value', () => {
    let events = 0;
    document.querySelector('#first_name')!.addEventListener('input', () => events++);
    fillPage(document, profile, answers);
    expect(events).toBe(1);
  });

  it('collects long answers you typed', () => {
    // Typed by the user (value differs from what the page put there)
    (document.querySelector('#q2') as HTMLTextAreaElement).value =
      'I fixed duplicated Stripe webhooks with an idempotency table and tests.';
    expect(collectAnswers(document)).toEqual([
      {
        question: 'Tell us about a technical challenge you solved.',
        answer: 'I fixed duplicated Stripe webhooks with an idempotency table and tests.',
      },
    ]);
  });
});
