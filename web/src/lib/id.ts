const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
export function newId(prefix = 'w'): string {
  let s = prefix + '_';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}
