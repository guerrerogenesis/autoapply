import { describe, expect, it } from 'vitest';
import { bestAnswer, guessCompany, matchField, pickOption, similarity } from '../src/core/matcher';
import type { FieldDescriptor, SavedAnswer } from '../src/core/types';

const field = (partial: Partial<FieldDescriptor>): FieldDescriptor => ({
  tag: 'input',
  type: 'text',
  name: '',
  id: '',
  placeholder: '',
  autocomplete: '',
  ariaLabel: '',
  label: '',
  ...partial,
});

describe('matchField', () => {
  it.each([
    [{ label: 'First Name *' }, 'firstName'],
    [{ label: 'Last Name' }, 'lastName'],
    [{ label: 'Apellidos' }, 'lastName'],
    [{ label: 'Nombre' }, 'firstName'],
    [{ label: 'Nombre completo' }, 'fullName'],
    [{ name: 'name' }, 'fullName'],
    [{ label: 'Correo electrónico' }, 'email'],
    [{ type: 'email' }, 'email'],
    [{ autocomplete: 'given-name' }, 'firstName'],
    [{ label: 'Teléfono' }, 'phone'],
    [{ label: 'LinkedIn Profile' }, 'linkedin'],
    [{ name: 'urls[GitHub]' }, 'github'],
    [{ name: 'urls[Portfolio]' }, 'portfolio'],
    [{ label: 'Current company' }, 'currentCompany'],
    [{ label: 'Años de experiencia' }, 'yearsExperience'],
    [{ label: 'Pretensión salarial (USD)' }, 'salaryExpectation'],
    [{ label: 'What is your English level?' }, 'englishLevel'],
    [{ label: 'País' }, 'country'],
    [{ id: 'firstName' }, 'firstName'],
  ] as [Partial<FieldDescriptor>, string][])('%o -> %s', (input, expected) => {
    expect(matchField(field(input))).toBe(expected);
  });

  it('ignores files, passwords and checkboxes', () => {
    expect(matchField(field({ type: 'file', label: 'Resume' }))).toBeNull();
    expect(matchField(field({ type: 'password', label: 'Email password' }))).toBeNull();
    expect(matchField(field({ type: 'checkbox', label: 'I accept' }))).toBeNull();
  });

  it('returns null for unknown fields', () => {
    expect(matchField(field({ label: 'Favorite color' }))).toBeNull();
  });
});

describe('answers', () => {
  const answers: SavedAnswer[] = [
    { id: '1', question: 'Why do you want to work here?', answer: 'Because…', updatedAt: '' },
    { id: '2', question: 'Describe a technical challenge you solved', answer: 'I built…', updatedAt: '' },
  ];

  it('finds the closest saved answer', () => {
    expect(bestAnswer('Why do you want to work at Acme?', answers)?.answer.id).toBe('1');
    expect(bestAnswer('Tell us about a technical challenge you solved.', answers)?.answer.id).toBe('2');
  });

  it('returns null when nothing is similar', () => {
    expect(bestAnswer('Do you have a car?', answers)).toBeNull();
  });

  it('similarity ignores accents and case', () => {
    expect(similarity('¿Por qué quieres trabajar aquí?', 'por que QUIERES trabajar aqui')).toBe(1);
  });
});

describe('pickOption', () => {
  const options = [
    { value: '', text: 'Select…' },
    { value: 'MX', text: 'México' },
    { value: 'US', text: 'United States' },
  ];
  it('matches without accents', () => expect(pickOption(options, 'Mexico')).toBe('MX'));
  it('matches by value', () => expect(pickOption(options, 'us')).toBe('US'));
  it('returns null when missing', () => expect(pickOption(options, 'Peru')).toBeNull());
});

describe('guessCompany', () => {
  it('reads the company from ATS URLs', () => {
    expect(guessCompany('https://boards.greenhouse.io/acme-labs/jobs/123', '')).toBe('Acme Labs');
    expect(guessCompany('https://jobs.lever.co/stripe/abc', '')).toBe('Stripe');
    expect(guessCompany('https://acme.workable.com/j/123', '')).toBe('Acme');
  });
  it('falls back to the page title', () => {
    expect(guessCompany('https://example.com/careers', 'Full Stack Developer at Acme Remote')).toBe('Acme Remote');
  });
});
