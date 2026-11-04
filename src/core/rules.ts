import type { FieldKey } from './types';

/** HTML `autocomplete` values are the most reliable signal, so they win first. */
export const AUTOCOMPLETE_MAP: Record<string, FieldKey> = {
  'given-name': 'firstName',
  'family-name': 'lastName',
  name: 'fullName',
  email: 'email',
  tel: 'phone',
  'tel-national': 'phone',
  'address-level2': 'city',
  'country-name': 'country',
  country: 'country',
  'organization-title': 'currentTitle',
  organization: 'currentCompany',
  url: 'portfolio',
};

/**
 * Text rules, checked in order. Specific rules go before generic ones
 * ("first name" before "name"). Patterns run on normalized text (no accents, lowercase).
 * Rules cover English and Spanish labels.
 */
export const TEXT_RULES: { key: FieldKey; patterns: RegExp[] }[] = [
  { key: 'email', patterns: [/\be ?mail\b/, /\bcorreo\b/] },
  { key: 'linkedin', patterns: [/linked ?in/] },
  { key: 'github', patterns: [/git ?hub/] },
  { key: 'portfolio', patterns: [/portfolio/, /portafolio/, /personal (web)?site/, /sitio web/, /\bwebsite\b/, /other website/] },
  { key: 'firstName', patterns: [/first ?name/, /given name/, /\bfname\b/, /^nombres?$/, /primer nombre/] },
  { key: 'lastName', patterns: [/last ?name/, /family name/, /surname/, /\blname\b/, /apellido/] },
  { key: 'fullName', patterns: [/full ?name/, /nombre completo/, /^name$/, /^your name$/, /^legal name$/] },
  { key: 'phone', patterns: [/phone/, /telefono/, /celular/, /\bmobile\b/, /whats ?app/] },
  { key: 'city', patterns: [/\bcity\b/, /ciudad/, /\blocation\b/, /ubicacion/, /where are you (based|located)/] },
  { key: 'country', patterns: [/country/, /\bpais\b/] },
  { key: 'currentCompany', patterns: [/current (company|employer)/, /empresa actual/, /^company$/] },
  { key: 'currentTitle', patterns: [/current (title|role|position)/, /job title/, /puesto actual/, /^title$/, /^headline$/] },
  { key: 'yearsExperience', patterns: [/years? of (professional )?experience/, /anos de experiencia/, /how many years/] },
  {
    key: 'salaryExpectation',
    patterns: [/salary/, /salario/, /sueldo/, /compensation/, /expected (pay|rate)/, /pretension/, /rate expectation/],
  },
  { key: 'noticePeriod', patterns: [/notice period/, /start date/, /when can you start/, /disponibilidad/, /fecha de inicio/, /availability/] },
  { key: 'englishLevel', patterns: [/english (level|proficiency)/, /nivel de ingles/, /ingles/] },
  { key: 'summary', patterns: [/summary/, /about (yourself|you)/, /resumen/, /acerca de ti/, /sobre ti/, /cover letter/] },
];

/** Inputs we never touch. */
export const SKIP_INPUT_TYPES = new Set([
  'hidden', 'file', 'password', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'search', 'range', 'color',
]);
