// Matching: every word of the query must be the start of a word in the
// record ("re ci" finds red circles). An empty query matches the whole
// catalog. The order of the matches is decided by ranking.js.
import { rank } from './ranking.js';

const words = (text) => String(text).toLowerCase().split(/\s+/).filter(Boolean);

export function buildIndex(catalog) {
  return catalog.records.map((record) => ({
    record,
    words: [...new Set(Object.entries(record).flatMap(([key, value]) => (key === 'hex' ? [] : words(value))))],
  }));
}

export function search(catalog, index, query, limit) {
  const terms = words(query);
  const matches = index
    .filter((entry) => terms.every((term) => entry.words.some((word) => word.startsWith(term))))
    .map((entry) => entry.record);
  const ranked = rank(catalog, matches, terms);
  return { count: ranked.length, results: ranked.slice(0, limit) };
}
