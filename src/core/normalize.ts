/** Lowercase, remove accents, turn separators into spaces. "Correo_Electrónico*" -> "correo electronico" */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@+\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split camelCase ("firstName" -> "first name"). */
export function splitCamel(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, '$1 $2');
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'to', 'of', 'and', 'or', 'in', 'on', 'for', 'at', 'is', 'are', 'you', 'your', 'do', 'why', 'what', 'how',
  'el', 'la', 'los', 'las', 'de', 'del', 'y', 'o', 'en', 'por', 'para', 'que', 'tu', 'te', 'un', 'una', 'es', 'se', 'con',
]);

export function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}
