/**
 * Security helpers for data that leaves the extension or comes back in.
 */

/**
 * Security fix #5: formula injection.
 * Google Sheets and Excel run text that starts with = + - @ (or tab / carriage return) as a formula.
 * A job page controls its title, and the title fills "Role", so a page could plant
 * =IMPORTXML(...) or =HYPERLINK(...) in your sheet. A leading apostrophe makes it plain text
 * (the apostrophe is not shown in the cell).
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Security fix #9: only http(s) links are shown as links. */
export function safeHref(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** Cut long text and remove control characters. */
export function cleanText(value: unknown, max = 5000): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);
}

/** HMAC-SHA256 as hex, for signing webhook requests (security fix #8). */
export async function hmacSha256(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random secret, e.g. "aa-7f3c…" (128 bits). */
export function newSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return 'aa-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
