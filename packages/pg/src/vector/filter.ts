/**
 * Translates MongoDB-style filter objects into PostgreSQL WHERE clause fragments
 * for JSONB metadata columns. Compatible with @mastra/pg's PGVectorFilter type.
 */

export type PGVectorFilter = Record<string, unknown> | null | undefined;

export type SqlParam = string | number | boolean | null;

export interface FilterResult {
  sql: string;
  values: SqlParam[];
}

const SAFE_KEY = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

/** Validates that a metadata key is a safe SQL identifier (no injection). */
export function sanitizeKey(key: string): string {
  if (!SAFE_KEY.test(key)) throw new Error(`Invalid metadata key: ${key}`);
  return key;
}

/**
 * Build a parameterized WHERE clause from a MongoDB-style filter object.
 * Returns { sql, values } where sql uses $1, $2... placeholders.
 */
export function buildFilterQuery(filter: PGVectorFilter, startParamIndex = 1): FilterResult {
  if (!filter || typeof filter !== 'object' || Object.keys(filter).length === 0) {
    return { sql: '', values: [] };
  }

  const values: SqlParam[] = [];
  let paramIdx = startParamIndex;

  function nextParam(value: unknown): string {
    values.push(value as SqlParam);
    return `$${paramIdx++}`;
  }

  function buildCondition(key: string, value: unknown): string {
    // Logical operators
    if (key === '$and') {
      const conditions = (value as PGVectorFilter[]).map((f) => buildFilter(f));
      return `(${conditions.join(' AND ')})`;
    }
    if (key === '$or') {
      const conditions = (value as PGVectorFilter[]).map((f) => buildFilter(f));
      return `(${conditions.join(' OR ')})`;
    }
    if (key === '$not') {
      return `NOT (${buildFilter(value as PGVectorFilter)})`;
    }
    if (key === '$nor') {
      const conditions = (value as PGVectorFilter[]).map((f) => buildFilter(f));
      return `NOT (${conditions.join(' OR ')})`;
    }

    // Field-level operators
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const ops = value as Record<string, unknown>;
      const conditions: string[] = [];

      for (const [op, opVal] of Object.entries(ops)) {
        conditions.push(buildOperator(key, op, opVal));
      }

      return conditions.length === 1 ? (conditions[0] as string) : `(${conditions.join(' AND ')})`;
    }

    // Implicit $eq
    if (Array.isArray(value)) {
      return buildOperator(key, '$in', value);
    }

    return buildOperator(key, '$eq', value);
  }

  function buildOperator(key: string, op: string, value: unknown): string {
    const safeKey = sanitizeKey(key);
    const jsonPath = `metadata#>>'{${safeKey}}'`;

    switch (op) {
      case '$eq':
        if (value === null) return `${jsonPath} IS NULL`;
        return `${jsonPath} = ${nextParam(String(value))}`;

      case '$ne':
        if (value === null) return `${jsonPath} IS NOT NULL`;
        return `(${jsonPath} IS NULL OR ${jsonPath} != ${nextParam(String(value))})`;

      case '$gt':
        return `(${jsonPath})::numeric > ${nextParam(value)}`;

      case '$gte':
        return `(${jsonPath})::numeric >= ${nextParam(value)}`;

      case '$lt':
        return `(${jsonPath})::numeric < ${nextParam(value)}`;

      case '$lte':
        return `(${jsonPath})::numeric <= ${nextParam(value)}`;

      case '$in': {
        const arr = value as unknown[];
        if (arr.length === 0) return 'FALSE';
        const params = arr.map((v) => nextParam(String(v)));
        return `${jsonPath} IN (${params.join(', ')})`;
      }

      case '$nin': {
        const arr = value as unknown[];
        if (arr.length === 0) return 'TRUE';
        const params = arr.map((v) => nextParam(String(v)));
        return `(${jsonPath} IS NULL OR ${jsonPath} NOT IN (${params.join(', ')}))`;
      }

      case '$exists':
        return value ? `metadata ? ${nextParam(key)}` : `NOT (metadata ? ${nextParam(key)})`;

      case '$regex': {
        const pattern = value instanceof RegExp ? value.source : String(value);
        return `${jsonPath} ~ ${nextParam(pattern)}`;
      }

      case '$contains':
        if (typeof value === 'string') {
          return `${jsonPath} ILIKE ${nextParam(`%${value}%`)}`;
        }
        return `metadata->'${safeKey}' @> ${nextParam(JSON.stringify(value))}::jsonb`;

      case '$size':
        return `jsonb_array_length(metadata->'${safeKey}') = ${nextParam(value)}`;

      case '$all': {
        const arr = value as unknown[];
        const params = arr.map((v) => nextParam(String(v)));
        return `metadata->'${safeKey}' ?& ARRAY[${params.join(', ')}]`;
      }

      case '$elemMatch': {
        const subFilter = value as Record<string, unknown>;
        const subConditions = Object.entries(subFilter).map(([subKey, subVal]) => {
          const safeSubKey = sanitizeKey(subKey);
          const elemPath = `elem#>>'{${safeSubKey}}'`;
          if (subVal !== null && typeof subVal === 'object' && !Array.isArray(subVal)) {
            const ops = subVal as Record<string, unknown>;
            return Object.entries(ops)
              .map(([subOp, subOpVal]) => buildElemOperator(elemPath, subOp, subOpVal))
              .join(' AND ');
          }
          return `${elemPath} = ${nextParam(String(subVal))}`;
        });
        return `EXISTS (SELECT 1 FROM jsonb_array_elements(metadata->'${safeKey}') AS elem WHERE ${subConditions.join(' AND ')})`;
      }

      default:
        throw new Error(`Unsupported filter operator: ${op}`);
    }
  }

  function buildElemOperator(elemPath: string, op: string, value: unknown): string {
    switch (op) {
      case '$eq':
        return `${elemPath} = ${nextParam(String(value))}`;
      case '$ne':
        return `${elemPath} != ${nextParam(String(value))}`;
      case '$gt':
        return `(${elemPath})::numeric > ${nextParam(value)}`;
      case '$gte':
        return `(${elemPath})::numeric >= ${nextParam(value)}`;
      case '$lt':
        return `(${elemPath})::numeric < ${nextParam(value)}`;
      case '$lte':
        return `(${elemPath})::numeric <= ${nextParam(value)}`;
      default:
        throw new Error(`Unsupported $elemMatch operator: ${op}`);
    }
  }

  function buildFilter(f: Record<string, unknown>): string {
    const conditions: string[] = [];
    for (const [key, value] of Object.entries(f)) {
      conditions.push(buildCondition(key, value));
    }
    return conditions.length === 1 ? (conditions[0] as string) : `(${conditions.join(' AND ')})`;
  }

  const sql = buildFilter(filter);
  return { sql, values };
}
