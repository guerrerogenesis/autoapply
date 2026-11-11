import { docxToText } from '../core/cv-docx';

/**
 * Read the text of a CV file inside the browser. Nothing is uploaded.
 * Supported: PDF, DOCX, TXT. Limits protect the page from huge or malicious files.
 */
export const MAX_CV_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 10;

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}
interface PdfPage {
  getTextContent(): Promise<{ items: PdfTextItem[] }>;
  getAnnotations(): Promise<{ url?: string }[]>;
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
}
interface PdfJs {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(params: Record<string, unknown>): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  // pdf.js is ~1.8 MB, so it is loaded only when you import a PDF.
  const pdfjs = (await import(/* @vite-ignore */ chrome.runtime.getURL('vendor/pdf.min.mjs'))) as PdfJs;
  pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('vendor/pdf.worker.min.mjs');

  const task = pdfjs.getDocument({
    data: bytes,
    // Safe settings: never run code from the PDF, no XFA forms, no embedded fonts in the page.
    isEvalSupported: false,
    enableXfa: false,
    disableFontFace: true,
  });

  try {
    const doc = await task.promise;
    const lines: string[] = [];
    const links: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES); n++) {
      const page = await doc.getPage(n);
      const { items } = await page.getTextContent();
      let line = '';
      for (const item of items) {
        line += item.str ?? '';
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      if (line) lines.push(line);
      // Hidden links ("LinkedIn" text that points to the profile URL)
      for (const a of await page.getAnnotations()) if (a.url) links.push(a.url);
    }
    return [...lines, ...links].join('\n');
  } finally {
    await task.destroy(); // stops the worker and frees memory
  }
}

export async function extractCvText(file: File): Promise<string> {
  if (file.size > MAX_CV_BYTES) throw new Error('The file is bigger than 5 MB.');
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (name.endsWith('.pdf') || file.type === 'application/pdf') return pdfToText(bytes);
  if (name.endsWith('.docx')) return docxToText(bytes);
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) return new TextDecoder().decode(bytes);
  if (name.endsWith('.doc')) throw new Error('Old .doc files are not supported. Save it as .docx or PDF.');
  throw new Error('Use a PDF, DOCX or TXT file.');
}
