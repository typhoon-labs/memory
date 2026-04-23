import type { SQL } from 'drizzle-orm';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Db } from '../../client';

/**
 * Configuration for a versioned storage domain.
 * All 7 versioned domains share this structure — the factory produces
 * type-safe CRUD operations using Drizzle instead of raw SQL.
 */
export interface VersionedDriverConfig {
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic constraints require concrete table types; callers pass typed refs
  mainTable: any;
  // biome-ignore lint/suspicious/noExplicitAny: same as above
  versionTable: any;
  /** PK column on the main table (e.g., agents.id) */
  mainId: PgColumn;
  /** FK column in versions table pointing back to main (e.g., agentVersions.agentId) */
  versionEntityId: PgColumn;
  /** Version number column (e.g., agentVersions.versionNumber) */
  versionNumber: PgColumn;
  /** Author column on main table, used for filtering */
  authorId?: PgColumn;
  /** Timestamp columns on main table for ordering */
  createdAt: PgColumn;
  updatedAt: PgColumn;
  /** Version table's PK (e.g., agentVersions.id) */
  versionId: PgColumn;
  /** Version table's createdAt for ordering */
  versionCreatedAt: PgColumn;
}

export interface PaginationArgs {
  page?: number;
  perPage?: number | false;
  orderBy?: { field?: string; direction?: string };
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  perPage: number | false;
  hasMore: boolean;
}

/**
 * Creates a versioned CRUD driver using Drizzle ORM.
 * Replaces VersionedStorageHelper's 314 lines of raw sql.unsafe() + 87-line column allowlist
 * with compile-time type-safe queries.
 */
export function createVersionedDriver(config: VersionedDriverConfig) {
  const {
    mainTable: main,
    versionTable: versions,
    mainId,
    versionEntityId,
    versionNumber,
    authorId,
    createdAt,
    updatedAt,
    versionId,
    versionCreatedAt,
  } = config;

  return {
    // ── Main entity CRUD ─────────────────────────────────────���────────

    async getById(db: Db, id: string): Promise<Record<string, unknown> | null> {
      const [row] = await db.select().from(main).where(eq(mainId, id));
      return (row as Record<string, unknown>) ?? null;
    },

    async create(db: Db, values: Record<string, unknown>): Promise<Record<string, unknown>> {
      const [row] = await db
        .insert(main)
        .values(values as never)
        .returning();
      return row as Record<string, unknown>;
    },

    async update(db: Db, id: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
      if (Object.keys(values).length === 0) {
        const existing = await this.getById(db, id);
        return existing!;
      }
      const [row] = await db
        .update(main)
        .set({ ...values, updatedAt: new Date() } as never)
        .where(eq(mainId, id))
        .returning();
      return row as Record<string, unknown>;
    },

    async delete(db: Db, id: string): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.delete(versions).where(eq(versionEntityId, id));
        await tx.delete(main).where(eq(mainId, id));
      });
    },

    async list(
      db: Db,
      args?: PaginationArgs & { filter?: { authorId?: string } },
    ): Promise<PaginatedResult<Record<string, unknown>>> {
      const page = args?.page ?? 0;
      const perPage = args?.perPage ?? 100;
      const direction = args?.orderBy?.direction === 'ASC' ? asc : desc;
      const orderCol = args?.orderBy?.field === 'updatedAt' ? updatedAt : createdAt;

      const conditions: SQL[] = [];
      if (args?.filter?.authorId && authorId) {
        conditions.push(eq(authorId, args.filter.authorId));
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(main).where(where);
      const total = countRow?.count ?? 0;

      let query = db.select().from(main).where(where).orderBy(direction(orderCol)).$dynamic();
      if (perPage !== false) {
        query = query.limit(perPage).offset(page * perPage);
      }
      const rows = await query;

      return {
        rows: rows as Record<string, unknown>[],
        total,
        page,
        perPage,
        hasMore: perPage !== false && (page + 1) * perPage < total,
      };
    },

    // ── Version CRUD ─────────────────────────────────────────────────

    async createVersion(db: Db, values: Record<string, unknown>): Promise<Record<string, unknown>> {
      const [row] = await db
        .insert(versions)
        .values(values as never)
        .returning();
      return row as Record<string, unknown>;
    },

    async getVersion(db: Db, id: string): Promise<Record<string, unknown> | null> {
      const [row] = await db.select().from(versions).where(eq(versionId, id));
      return (row as Record<string, unknown>) ?? null;
    },

    async getVersionByNumber(db: Db, entityId: string, num: number): Promise<Record<string, unknown> | null> {
      const [row] = await db
        .select()
        .from(versions)
        .where(and(eq(versionEntityId, entityId), eq(versionNumber, num)));
      return (row as Record<string, unknown>) ?? null;
    },

    async getLatestVersion(db: Db, entityId: string): Promise<Record<string, unknown> | null> {
      const [row] = await db
        .select()
        .from(versions)
        .where(eq(versionEntityId, entityId))
        .orderBy(desc(versionNumber))
        .limit(1);
      return (row as Record<string, unknown>) ?? null;
    },

    async listVersions(
      db: Db,
      entityId: string,
      args?: PaginationArgs,
    ): Promise<PaginatedResult<Record<string, unknown>>> {
      const page = args?.page ?? 0;
      const perPage = args?.perPage ?? 20;
      const direction = args?.orderBy?.direction === 'ASC' ? asc : desc;
      const orderCol = args?.orderBy?.field === 'createdAt' ? versionCreatedAt : versionNumber;

      const where = eq(versionEntityId, entityId);

      const [countRow] = await db.select({ count: sql<number>`count(*)::int` }).from(versions).where(where);
      const total = countRow?.count ?? 0;

      let query = db.select().from(versions).where(where).orderBy(direction(orderCol)).$dynamic();
      if (perPage !== false) {
        query = query.limit(perPage).offset(page * perPage);
      }
      const rows = await query;

      return {
        rows: rows as Record<string, unknown>[],
        total,
        page,
        perPage,
        hasMore: perPage !== false && (page + 1) * perPage < total,
      };
    },

    async deleteVersion(db: Db, id: string): Promise<void> {
      await db.delete(versions).where(eq(versionId, id));
    },

    async deleteVersionsByParentId(db: Db, entityId: string): Promise<void> {
      await db.delete(versions).where(eq(versionEntityId, entityId));
    },

    async countVersions(db: Db, entityId: string): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(versions)
        .where(eq(versionEntityId, entityId));
      return row?.count ?? 0;
    },

    async dangerouslyClearAll(db: Db): Promise<void> {
      await db.transaction(async (tx) => {
        await tx.delete(versions);
        await tx.delete(main);
      });
    },
  };
}
