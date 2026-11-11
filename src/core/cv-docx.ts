import { strFromU8, unzipSync } from 'fflate';

/**
 * Text from a .docx file (a zip of XML files), without a big library.
 * Reads word/document.xml paragraph by paragraph, and also the link targets,
 * because many CVs show "LinkedIn" as text and hide the URL in a link.
 */
const decode = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

export function docxToText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    // Only unzip the files we need (a .docx can contain big images).
    files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' || f.name === 'word/_rels/document.xml.rels' });
  } catch {
    throw new Error('This .docx file could not be opened.');
  }
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('This is not a Word document.');

  const xml = strFromU8(doc);
  const paragraphs = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
  // In each paragraph keep, in order: text runs (<w:t>), tabs and line breaks.
  const lines = paragraphs.map((p) =>
    [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
      .map((m) => (m[1] !== undefined ? decode(m[1]) : m[0] === '<w:tab/>' ? '\t' : '\n'))
      .join(''),
  );

  const rels = files['word/_rels/document.xml.rels'];
  const links = rels
    ? [...strFromU8(rels).matchAll(/Target="(https?:\/\/[^"]+)"[^>]*TargetMode="External"|TargetMode="External"[^>]*Target="(https?:\/\/[^"]+)"/g)].map(
        (m) => decode(m[1] ?? m[2]),
      )
    : [];

  return [...lines, ...links].join('\n');
}
