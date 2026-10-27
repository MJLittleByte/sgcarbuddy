/** Small text helpers shared by the normalisers. Pure. */

export const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/** Words that stay upper case when title-casing government ALL-CAPS names. */
const KEEP_UPPER = new Set([
  'HDB', 'MSCP', 'URA', 'LTA', 'JTC', 'CPF', 'NTUC', 'SAFRA', 'YMCA', 'MRT', 'LRT', 'ITE', 'NUS', 'NTU', 'SMU', 'SIT', 'SUTD', 'SGH', 'KKH', 'TTSH',
  'PIE', 'AYE', 'BKE', 'CTE', 'ECP', 'KJE', 'KPE', 'MCE', 'SLE', 'TPE', 'NSC', 'ION', 'IMM', 'CQ', 'PH', 'EV', 'SP', 'YTL', 'ENGIE', 'MBS', 'RWS', 'II', 'III', 'IV',
]);
const KEEP_LOWER = new Set(['of', 'and', 'the', 'at', 'by', 'on', 'to']);

/**
 * "BLK 109/117 TECK WHYE LANE" → "Blk 109/117 Teck Whye Lane". Mixed-case input is returned unchanged
 * (LTA mall names such as "ION Orchard" are already written properly).
 */
export function titleCase(input: string): string {
  const s = str(input).replace(/\s+/g, ' ');
  if (!s || /[a-z]/.test(s)) return s;
  return s
    .split(' ')
    .map((w, i) => {
      const bare = w.replace(/[^A-Z0-9+]/g, '');
      if (KEEP_UPPER.has(bare)) return w;
      if (/\d/.test(w)) return w; // 118A, 109/117, 2B
      const lower = w.toLowerCase();
      if (i > 0 && KEEP_LOWER.has(lower)) return lower;
      return lower.replace(/(^|[-/(&'.])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());
    })
    .join(' ');
}

/** Minimal RFC 4180 CSV parser (quoted fields, commas and newlines inside quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((x) => x !== '')) rows.push(row);
  }
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.replace(/^\uFEFF/, '').trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Short, stable, non-cryptographic hash (FNV-1a, base36) for catalogue versions. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
