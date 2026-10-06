// Ranking as released in 2.1.0: matches on a heavier field come first.
//
// DEMO: this release is the incident. It reads ranking weights from a
// `ranking` section that the seed catalogue does not have, so every search
// throws a TypeError and answers HTTP 500. Do not fix it here: the fix the
// demo shows is rolling the image tag back to 2.0.0.
export const strategy = 'weighted';

function score(record, terms, weights) {
  return terms.reduce(
    (total, term) => total + Object.entries(weights).reduce((sum, [field, weight]) => sum + (String(record[field]).startsWith(term) ? weight : 0), 0),
    0,
  );
}

export function rank(catalog, matches, terms) {
  const weights = catalog.ranking.weights;
  return [...matches].sort((a, b) => score(b, terms, weights) - score(a, terms, weights));
}
