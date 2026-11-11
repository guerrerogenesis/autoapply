import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { docxToText } from '../src/core/cv-docx';
import { parseCv } from '../src/core/cv-parser';

const NOW = new Date('2026-11-03T12:00:00Z');

const CV_EN = `
Ana Pérez
Full Stack Developer
Guadalajara, Jalisco, Mexico | +52 33 1234 5678 | ana.perez@example.com
linkedin.com/in/ana-perez-dev | github.com/anaperez | anaperez.dev

SUMMARY
Full stack developer with 6+ years of experience building web apps with Laravel, Vue and React.
I like clean code and remote teams.

EXPERIENCE
Senior Developer — Acme Corp        2022 – Present
Web Developer — Globex              2019 – 2022

EDUCATION
B.Sc. Computer Science, 2014 – 2018

LANGUAGES
Spanish (native), English B2
`;

const CV_ES = `
CARLOS MENDOZA RUIZ
Desarrollador Backend
carlos.mendoza@correo.mx
Tel: (322) 555 0199 44
Puerto Vallarta, México

PERFIL PROFESIONAL
Desarrollador backend enfocado en APIs con Node.js y PostgreSQL.

EXPERIENCIA LABORAL
Backend Developer, Empresa X
Enero 2021 – Actual
Programador Jr, Empresa Y
2018 – 2020

FORMACIÓN ACADÉMICA
Ingeniería en Sistemas, 2013 – 2017

IDIOMAS
Inglés: Intermedio
`;

describe('parseCv – English CV', () => {
  const r = parseCv(CV_EN, NOW);
  it('finds contact data', () => {
    expect(r.firstName).toBe('Ana');
    expect(r.lastName).toBe('Pérez');
    expect(r.email).toBe('ana.perez@example.com');
    expect(r.phone).toBe('+52 33 1234 5678');
  });
  it('finds links and normalizes them to https', () => {
    expect(r.linkedin).toBe('https://linkedin.com/in/ana-perez-dev');
    expect(r.github).toBe('https://github.com/anaperez');
    expect(r.portfolio).toBe('https://anaperez.dev');
  });
  it('finds title, location, English level, years and summary', () => {
    expect(r.currentTitle).toBe('Full Stack Developer');
    expect(r.city).toBe('Guadalajara');
    expect(r.country).toBe('Mexico');
    expect(r.englishLevel).toBe('B2');
    expect(r.yearsExperience).toBe('6');
    expect(r.summary).toMatch(/^Full stack developer with 6\+ years.*remote teams\.$/);
  });
});

describe('parseCv – Spanish CV', () => {
  const r = parseCv(CV_ES, NOW);
  it('handles ALL CAPS names with two last names', () => {
    expect(r.firstName).toBe('Carlos');
    expect(r.lastName).toBe('Mendoza Ruiz');
  });
  it('finds the rest', () => {
    expect(r.email).toBe('carlos.mendoza@correo.mx');
    expect(r.phone).toBe('(322) 555 0199 44');
    expect(r.currentTitle).toBe('Desarrollador Backend');
    expect(r.city).toBe('Puerto Vallarta');
    expect(r.country).toBe('Mexico');
    expect(r.englishLevel).toBe('Intermedio');
    expect(r.summary).toBe('Desarrollador backend enfocado en APIs con Node.js y PostgreSQL.');
  });
  it('counts years from the first job, not from education', () => {
    expect(r.yearsExperience).toBe('8'); // 2026 - 2018
  });
  it('does not take the email domain as a portfolio', () => {
    expect(r.portfolio).toBeUndefined();
  });
});

describe('parseCv – safety', () => {
  it('returns only what it finds', () => {
    expect(parseCv('just some random text')).toEqual({});
  });
  it('does not take a date range as a phone number', () => {
    expect(parseCv('Experience\n2019 - 2023\n2015 - 2019').phone).toBeUndefined();
  });
});

describe('docxToText', () => {
  const docx = (body: string, rels = '') =>
    zipSync({
      'word/document.xml': strToU8(`<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`),
      ...(rels ? { 'word/_rels/document.xml.rels': strToU8(rels) } : {}),
    });

  it('reads paragraphs, split runs, tabs and entities', () => {
    const body =
      '<w:p><w:r><w:t>Ana </w:t></w:r><w:r><w:t xml:space="preserve">Pérez</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Dev</w:t><w:tab/><w:t>R&amp;D</w:t></w:r></w:p>';
    expect(docxToText(docx(body))).toBe('Ana Pérez\nDev\tR&D');
  });

  it('adds hidden link targets (e.g. "LinkedIn" text with a URL)', () => {
    const rels =
      '<Relationships><Relationship Id="r1" Type="hyperlink" Target="https://linkedin.com/in/ana" TargetMode="External"/></Relationships>';
    const text = docxToText(docx('<w:p><w:r><w:t>LinkedIn</w:t></w:r></w:p>', rels));
    expect(parseCv(`Ana Pérez\n${text}`).linkedin).toBe('https://linkedin.com/in/ana');
  });

  it('rejects files that are not Word documents', () => {
    expect(() => docxToText(strToU8('not a zip'))).toThrow();
    expect(() => docxToText(zipSync({ 'other.xml': strToU8('<x/>') }))).toThrow('not a Word document');
  });
});
