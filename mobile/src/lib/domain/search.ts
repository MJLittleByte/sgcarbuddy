/**
 * Local carpark search (name, block, street, carpark code). Street-name abbreviations are expanded so
 * "teck whye ln", "Blk 135" and "ck7" all match. Pure.
 */
import type { CarparkInfo } from '../../../../shared/contract';

const ABBR: Record<string, string> = {
  ave: 'avenue', av: 'avenue', st: 'street', rd: 'road', dr: 'drive', ln: 'lane', cres: 'crescent', cl: 'close', ctr: 'centre', center: 'centre',
  bt: 'bukit', jln: 'jalan', upp: 'upper', lor: 'lorong', pk: 'park', pl: 'place', blvd: 'boulevard', hts: 'heights', ter: 'terrace', sq: 'square',
  blk: 'block', mscp: 'multi', nth: 'north', sth: 'south', ctrl: 'central', cbd: 'central', tg: 'tanjong', kg: 'kampong', mkt: 'market', ind: 'industrial',
};

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/&/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => ABBR[w] ?? w);
}

export interface IndexedCarpark {
  cp: CarparkInfo;
  tokens: string[];
  code: string;
}

export function indexCarparks(list: readonly CarparkInfo[]): IndexedCarpark[] {
  return list.map((cp) => ({ cp, tokens: words(cp.name), code: cp.code.toLowerCase() }));
}

/** Every query word must prefix-match a name word (or the whole query is the carpark code). Best matches first. */
export function searchCarparks(index: readonly IndexedCarpark[], q: string, limit = 6): CarparkInfo[] {
  const qw = words(q);
  if (!qw.length) return [];
  const qc = q.trim().toLowerCase();
  const hits: Array<{ cp: CarparkInfo; score: number }> = [];
  for (const it of index) {
    if (it.code === qc) {
      hits.push({ cp: it.cp, score: 1000 });
      continue;
    }
    let score = 0;
    let ok = true;
    for (const w of qw) {
      const exact = it.tokens.includes(w);
      if (exact) score += 3;
      else if (it.tokens.some((t) => t.startsWith(w))) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) hits.push({ cp: it.cp, score: score - it.tokens.length * 0.01 });
  }
  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((h) => h.cp);
}

export const isPostalCode = (q: string) => /^\d{6}$/.test(q.trim());
