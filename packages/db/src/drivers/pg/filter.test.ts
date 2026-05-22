import { describe, expect, it } from 'vitest';

import { buildFilterQuery } from './filter';

describe('buildFilterQuery', () => {
  describe('empty/null filters', () => {
    it('returns empty for null filter', () => {
      const result = buildFilterQuery(null);
      expect(result.sql).toBe('');
      expect(result.values).toEqual([]);
    });

    it('returns empty for undefined filter', () => {
      const result = buildFilterQuery(undefined);
      expect(result.sql).toBe('');
      expect(result.values).toEqual([]);
    });

    it('returns empty for empty object', () => {
      const result = buildFilterQuery({});
      expect(result.sql).toBe('');
      expect(result.values).toEqual([]);
    });
  });

  describe('basic operators', () => {
    it('implicit $eq for primitive values', () => {
      const result = buildFilterQuery({ status: 'active' });
      expect(result.sql).toContain("metadata#>>'{status}'");
      expect(result.sql).toContain('$1');
      expect(result.values).toEqual(['active']);
    });

    it('implicit $in for array values', () => {
      const result = buildFilterQuery({ status: ['a', 'b'] });
      expect(result.sql).toContain('IN');
      expect(result.values).toEqual(['a', 'b']);
    });

    it('$eq with null', () => {
      const result = buildFilterQuery({ status: { $eq: null } });
      expect(result.sql).toContain('IS NULL');
    });

    it('$ne with value', () => {
      const result = buildFilterQuery({ status: { $ne: 'deleted' } });
      expect(result.sql).toContain('!=');
      expect(result.values).toContain('deleted');
    });

    it('$ne with null', () => {
      const result = buildFilterQuery({ status: { $ne: null } });
      expect(result.sql).toContain('IS NOT NULL');
    });

    it('$gt numeric', () => {
      const result = buildFilterQuery({ count: { $gt: 5 } });
      expect(result.sql).toContain('::numeric >');
      expect(result.values).toContain(5);
    });

    it('$gte numeric', () => {
      const result = buildFilterQuery({ count: { $gte: 5 } });
      expect(result.sql).toContain('::numeric >=');
    });

    it('$lt numeric', () => {
      const result = buildFilterQuery({ count: { $lt: 10 } });
      expect(result.sql).toContain('::numeric <');
    });

    it('$lte numeric', () => {
      const result = buildFilterQuery({ count: { $lte: 10 } });
      expect(result.sql).toContain('::numeric <=');
    });
  });

  describe('array operators', () => {
    it('$in with values', () => {
      const result = buildFilterQuery({ color: { $in: ['red', 'blue'] } });
      expect(result.sql).toContain('IN');
      expect(result.values).toEqual(['red', 'blue']);
    });

    it('$in with empty array returns FALSE', () => {
      const result = buildFilterQuery({ color: { $in: [] } });
      expect(result.sql).toContain('FALSE');
    });

    it('$nin with values', () => {
      const result = buildFilterQuery({ color: { $nin: ['red'] } });
      expect(result.sql).toContain('NOT IN');
    });

    it('$nin with empty array returns TRUE', () => {
      const result = buildFilterQuery({ color: { $nin: [] } });
      expect(result.sql).toContain('TRUE');
    });
  });

  describe('logical operators', () => {
    it('$and', () => {
      const result = buildFilterQuery({
        $and: [{ status: 'active' }, { type: 'user' }],
      });
      expect(result.sql).toContain('AND');
      expect(result.values).toContain('active');
      expect(result.values).toContain('user');
    });

    it('$or', () => {
      const result = buildFilterQuery({
        $or: [{ status: 'active' }, { status: 'pending' }],
      });
      expect(result.sql).toContain('OR');
    });

    it('$not', () => {
      const result = buildFilterQuery({
        $not: { status: 'deleted' },
      });
      expect(result.sql).toContain('NOT');
    });

    it('$nor', () => {
      const result = buildFilterQuery({
        $nor: [{ status: 'deleted' }, { status: 'archived' }],
      });
      expect(result.sql).toContain('NOT');
      expect(result.sql).toContain('OR');
    });
  });

  describe('special operators', () => {
    it('$exists true', () => {
      const result = buildFilterQuery({ email: { $exists: true } });
      expect(result.sql).toContain('metadata ?');
    });

    it('$exists false', () => {
      const result = buildFilterQuery({ email: { $exists: false } });
      expect(result.sql).toContain('NOT');
    });

    it('$regex', () => {
      const result = buildFilterQuery({ name: { $regex: '^John' } });
      expect(result.sql).toContain('~');
      expect(result.values).toContain('^John');
    });

    it('$contains string', () => {
      const result = buildFilterQuery({ name: { $contains: 'test' } });
      expect(result.sql).toContain('ILIKE');
      expect(result.values).toContain('%test%');
    });
  });

  describe('multiple conditions on same field', () => {
    it('range filter', () => {
      const result = buildFilterQuery({ age: { $gte: 18, $lt: 65 } });
      expect(result.sql).toContain('>=');
      expect(result.sql).toContain('<');
      expect(result.values).toContain(18);
      expect(result.values).toContain(65);
    });
  });

  describe('param indexing', () => {
    it('starts from custom param index', () => {
      const result = buildFilterQuery({ status: 'active' }, 5);
      expect(result.sql).toContain('$5');
      expect(result.values).toEqual(['active']);
    });

    it('increments param indices correctly', () => {
      const result = buildFilterQuery({
        $and: [{ a: '1' }, { b: '2' }, { c: '3' }],
      });
      expect(result.sql).toContain('$1');
      expect(result.sql).toContain('$2');
      expect(result.sql).toContain('$3');
      expect(result.values).toEqual(['1', '2', '3']);
    });
  });

  describe('edge cases', () => {
    it('boolean values', () => {
      const result = buildFilterQuery({ active: true });
      expect(result.values).toEqual(['true']);
    });

    it('numeric values', () => {
      const result = buildFilterQuery({ count: 42 });
      expect(result.values).toEqual(['42']);
    });

    it('throws on unsupported operator', () => {
      expect(() => buildFilterQuery({ x: { $unknown: 1 } })).toThrow('Unsupported filter operator');
    });

    it('throws on invalid metadata key', () => {
      expect(() => buildFilterQuery({ 'drop table; --': 'x' })).toThrow('Invalid metadata key');
    });

    it('handles $ne with null (IS NOT NULL)', () => {
      const result = buildFilterQuery({ status: { $ne: null } });
      expect(result.sql).toContain('IS NOT NULL');
      expect(result.values).toEqual([]);
    });

    it('handles deeply nested $and inside $or', () => {
      const result = buildFilterQuery({
        $or: [{ $and: [{ a: '1' }, { b: '2' }] }, { c: '3' }],
      });
      expect(result.sql).toContain('AND');
      expect(result.sql).toContain('OR');
      expect(result.values).toEqual(['1', '2', '3']);
    });

    it('$in with single value', () => {
      const result = buildFilterQuery({ status: { $in: ['active'] } });
      expect(result.sql).toContain('IN');
      expect(result.values).toEqual(['active']);
    });

    it('$size operator', () => {
      const result = buildFilterQuery({ tags: { $size: 3 } });
      expect(result.sql).toContain('jsonb_array_length');
      expect(result.values).toContain(3);
    });

    it('$contains with object (JSONB containment)', () => {
      const result = buildFilterQuery({ data: { $contains: { nested: true } } });
      expect(result.sql).toContain('@>');
    });

    it('$elemMatch with sub-operator', () => {
      const result = buildFilterQuery({
        items: { $elemMatch: { price: { $gt: 10 } } },
      });
      expect(result.sql).toContain('EXISTS');
      expect(result.sql).toContain('jsonb_array_elements');
      expect(result.values).toContain(10);
    });

    it('$regex with RegExp object', () => {
      const result = buildFilterQuery({ name: { $regex: /^test/i } });
      expect(result.sql).toContain('~');
      expect(result.values).toContain('^test');
    });

    it('$all operator', () => {
      const result = buildFilterQuery({ tags: { $all: ['a', 'b'] } });
      expect(result.sql).toContain('?&');
      expect(result.values).toEqual(['a', 'b']);
    });
  });
});
