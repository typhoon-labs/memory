// Ranking as released in 2.0.0: matches keep their catalog order.
export const strategy = 'catalog-order';

export function rank(catalog, matches) {
  return matches;
}
