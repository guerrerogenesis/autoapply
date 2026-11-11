import type { Profile } from './types';

/**
 * Find profile data in the text of a CV (English or Spanish), with simple rules.
 * No AI and no network: it runs in your browser. The result is only a suggestion:
 * the options page shows it and you choose what to keep.
 */
export type CvFields = Partial<Record<keyof Profile, string>>;

const SECTION_HEADINGS = [
  'summary', 'professional summary', 'profile', 'professional profile', 'about', 'about me', 'objective',
  'experience', 'work experience', 'professional experience', 'employment', 'education', 'skills',
  'technical skills', 'projects', 'languages', 'certifications', 'courses', 'contact', 'references', 'interests',
  'resumen', 'resumen profesional', 'perfil', 'perfil profesional', 'acerca de mi', 'sobre mi', 'objetivo',
  'experiencia', 'experiencia laboral', 'experiencia profesional', 'educacion', 'formacion', 'formacion academica',
  'habilidades', 'habilidades tecnicas', 'proyectos', 'idiomas', 'certificaciones', 'cursos', 'contacto', 'referencias', 'intereses',
];
const SUMMARY_HEADINGS = ['summary', 'professional summary', 'profile', 'professional profile', 'about', 'about me', 'objective',
  'resumen', 'resumen profesional', 'perfil', 'perfil profesional', 'acerca de mi', 'sobre mi', 'objetivo'];
const EXPERIENCE_HEADINGS = ['experience', 'work experience', 'professional experience', 'employment',
  'experiencia', 'experiencia laboral', 'experiencia profesional'];

const COUNTRIES: Record<string, string> = {
  mexico: 'Mexico', 'united states': 'United States', usa: 'United States', canada: 'Canada', colombia: 'Colombia',
  argentina: 'Argentina', chile: 'Chile', peru: 'Peru', espana: 'Spain', spain: 'Spain', venezuela: 'Venezuela',
  ecuador: 'Ecuador', uruguay: 'Uruguay', 'costa rica': 'Costa Rica', guatemala: 'Guatemala', brasil: 'Brazil', brazil: 'Brazil',
  'united kingdom': 'United Kingdom', uk: 'United Kingdom', germany: 'Germany', portugal: 'Portugal',
};

const NAME_PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'van', 'von', 'da', 'di']);

const ROLE_WORDS = /\b(developer|engineer|programmer|designer|architect|analyst|manager|lead|consultant|devops|qa|tester|scientist|full[\s-]?stack|front[\s-]?end|back[\s-]?end|desarrollador(a)?|ingenier[oa]|programador(a)?|disenador(a)?|arquitect[oa]|analista|lider|consultor(a)?)\b/;

/** Lowercase, no accents, no punctuation at the ends: "Experiencia Laboral:" -> "experiencia laboral" */
const norm = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const isHeading = (line: string, list = SECTION_HEADINGS) => line.length < 40 && list.includes(norm(line));

function findEmail(text: string): string {
  return text.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0] ?? '';
}

function findPhone(text: string): string {
  for (const m of text.matchAll(/(\+?\(?\d[\d\s().-]{8,}\d)/g)) {
    const candidate = m[1].trim();
    const digits = candidate.replace(/\D/g, '');
    // 10–15 digits, and not a date range like "2019 - 2023"
    if (digits.length >= 10 && digits.length <= 15 && !/^\d{4}\s*[-–]\s*\d{4}$/.test(candidate)) return candidate.replace(/\s+/g, ' ');
  }
  return '';
}

const withHttps = (url: string) => (/^https?:\/\//i.test(url) ? url.replace(/^http:/i, 'https:') : `https://${url}`).replace(/\/+$/, '');

function findLinks(text: string): { linkedin: string; github: string; portfolio: string } {
  const linkedin = text.match(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[\w%.-]+/i)?.[0] ?? '';
  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/(?!orgs\/|features|about)[\w-]+/i)?.[0] ?? '';
  let portfolio = '';
  const withoutEmails = text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, ' ');
  const urlLike = /(?<![@\w.])((?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com\.mx|com|dev|io|me|net|org|app|tech|site|mx|co|xyz)(?![a-z0-9-])(?:\/[^\s,;)]*)?)/gi;
  for (const m of withoutEmails.matchAll(urlLike)) {
    const url = m[1];
    if (/linkedin\.com|github\.com|gmail|hotmail|outlook|yahoo|icloud/i.test(url)) continue;
    portfolio = url;
    break;
  }
  return {
    linkedin: linkedin && withHttps(linkedin),
    github: github && withHttps(github),
    portfolio: portfolio && withHttps(portfolio),
  };
}

/** The name is usually the first short line with only letters. */
function findName(lines: string[]): { firstName: string; lastName: string } {
  for (const line of lines.slice(0, 6)) {
    if (isHeading(line) || /[@\d/:|]/.test(line)) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;
    if (!words.every((w) => /^[\p{L}][\p{L}'.-]*$/u.test(w))) continue;
    // Names start with a capital letter (particles like "de", "del", "la" are allowed)
    if (!words.every((w) => /^\p{Lu}/u.test(w) || NAME_PARTICLES.has(w.toLowerCase()))) continue;
    if (ROLE_WORDS.test(norm(line))) continue;
    const proper = words.map((w) => (w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w));
    // 2 words: Ana | Pérez. 3 words: Ana | Pérez López (two last names are common in Spanish). 4 words: Ana María | Pérez López
    const split = proper.length === 4 ? 2 : 1;
    return { firstName: proper.slice(0, split).join(' '), lastName: proper.slice(split).join(' ') };
  }
  return { firstName: '', lastName: '' };
}

/** A short line near the top with a role word ("Full Stack Developer"). */
function findTitle(lines: string[]): string {
  for (const line of lines.slice(0, 8)) {
    if (line.length > 70 || /[@]|https?:|\d{3}/.test(line) || isHeading(line)) continue;
    if (ROLE_WORDS.test(norm(line))) return line.replace(/\s*[|•·]\s*/g, ' · ').trim();
  }
  return '';
}

/** "Puerto Vallarta, Jalisco, México" or "Guadalajara, Mexico" near the top. */
function findLocation(lines: string[]): { city: string; country: string } {
  for (const line of lines.slice(0, 12)) {
    for (const piece of line.split(/\s*[|•·]\s*/)) {
      if (/[@\d]|https?:|www\./.test(piece) || !piece.includes(',')) continue;
      const parts = piece.split(',').map((p) => p.trim()).filter(Boolean);
      const country = COUNTRIES[norm(parts[parts.length - 1])];
      if (country && parts.length >= 2) return { city: parts[0], country };
    }
  }
  for (const line of lines.slice(0, 12)) {
    const country = Object.keys(COUNTRIES).find((c) => new RegExp(`(^| )${c}( |$)`).test(norm(line)));
    if (country && line.length < 60 && !/[@]/.test(line)) return { city: '', country: COUNTRIES[country] };
  }
  return { city: '', country: '' };
}

const LEVEL = '(A1|A2|B1|B2|C1|C2|native|nativo|fluent|fluido|advanced|avanzado|upper[- ]intermediate|intermediate|intermedio|basic|basico)';

function findEnglishLevel(text: string): string {
  const t = norm(text);
  const m = t.match(new RegExp(`(?:english|ingles)\\s*(?:level|nivel)?\\s*${LEVEL.toLowerCase()}`)) ?? t.match(new RegExp(`${LEVEL.toLowerCase()}\\s*(?:english|ingles)`));
  if (!m) return '';
  const level = m[1];
  return /^[abc][12]$/.test(level) ? level.toUpperCase() : level.charAt(0).toUpperCase() + level.slice(1);
}

/**
 * "5+ years of experience" / "5 años de experiencia", or else the years since the
 * first job in the Experience section (from date ranges like "2019 – Present").
 */
function findYears(text: string, lines: string[], now = new Date()): string {
  const explicit = norm(text).match(/(\d{1,2})\s*(?:years?|anos)\s*(?:of\s*)?(?:professional\s*)?(?:experience|de experiencia)/);
  if (explicit) return explicit[1];

  const start = lines.findIndex((l) => isHeading(l, EXPERIENCE_HEADINGS));
  if (start === -1) return '';
  const end = lines.findIndex((l, i) => i > start && isHeading(l) && !isHeading(l, EXPERIENCE_HEADINGS));
  const section = lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
  const years = [...section.matchAll(/\b(19[89]\d|20\d{2})\b/g)].map((m) => Number(m[1])).filter((y) => y <= now.getFullYear());
  if (!years.length) return '';
  const total = now.getFullYear() - Math.min(...years);
  return total > 0 && total < 50 ? String(total) : '';
}

function findSummary(lines: string[]): string {
  const start = lines.findIndex((l) => isHeading(l, SUMMARY_HEADINGS));
  if (start === -1) return '';
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (isHeading(line)) break;
    out.push(line);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
}

export function parseCv(text: string, now = new Date()): CvFields {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);

  const fields: CvFields = {
    ...findName(lines),
    email: findEmail(clean),
    phone: findPhone(clean),
    ...findLinks(clean),
    currentTitle: findTitle(lines),
    ...findLocation(lines),
    englishLevel: findEnglishLevel(clean),
    yearsExperience: findYears(clean, lines, now),
    summary: findSummary(lines),
  };
  // Only return what was found
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v)) as CvFields;
}
