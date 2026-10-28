/**
 * UUID determinista a partir de una clave legible. Permite que la demo tenga
 * los mismos identificadores en el modo local y en supabase/seed.sql.
 */
export function demoId(key: string): string {
  const hex: string[] = [];
  for (let round = 0; round < 4; round++) {
    let h = 0x811c9dc5 ^ (round * 0x9e3779b9);
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    hex.push((h >>> 0).toString(16).padStart(8, '0'));
  }
  const s = hex.join('');
  // Versión 4 / variante RFC 4122 para que Postgres lo acepte como uuid.
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-a${s.slice(17, 20)}-${s.slice(20, 32)}`;
}
