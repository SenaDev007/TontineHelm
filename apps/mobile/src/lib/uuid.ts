// TontiHelm mobile — générateur UUID v7 (brief : identifiants d'encaissements
// du téléphone en v7 — triables par temps, index SQLite efficaces). Zéro
// dépendance : horodatage milliseconde + aléa cryptographique via crypto.
// La contrainte stricte est validée par @tontihelm/schemas (UuidV7Schema).
const HEX = "0123456789abcdef";

function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += HEX[b & 0xf];
  return out;
}

/** UUID v7 conforme RFC 9562 : 48 bits d'horodatage ms + version 7 + variante. */
export function uuidv7(): string {
  const ts = Date.now();
  const tsHex = ts.toString(16).padStart(12, "0");
  return [
    tsHex.slice(0, 8),
    tsHex.slice(8),
    `7${randomHex(3)}`,
    `8${randomHex(3)}`,
    randomHex(12),
  ].join("-");
}
