import { BlobStore } from '@mastra/core/storage';
import { eq, inArray } from 'drizzle-orm';

import type { Db } from '../../client';
import { skillBlobs } from '../../schema/blobs';

export class DrizzleBlobsStorage extends BlobStore {
  constructor(private db: Db) {
    super();
  }

  async init() {}

  async dangerouslyClearAll() {
    await this.db.delete(skillBlobs);
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra StorageBlobEntry type
  async put(entry: any) {
    await this.db
      .insert(skillBlobs)
      .values({
        hash: entry.hash,
        content: entry.content,
        size: entry.size ?? 0,
        mimeType: entry.mimeType ?? null,
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: skillBlobs.hash });
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra types
  async get(hash: string): Promise<any> {
    const [row] = await this.db.select().from(skillBlobs).where(eq(skillBlobs.hash, hash));
    return row ?? null;
  }

  async has(hash: string): Promise<boolean> {
    const [row] = await this.db
      .select({ hash: skillBlobs.hash })
      .from(skillBlobs)
      .where(eq(skillBlobs.hash, hash))
      .limit(1);
    return !!row;
  }

  async delete(hash: string): Promise<boolean> {
    const result = await this.db.delete(skillBlobs).where(eq(skillBlobs.hash, hash)).returning();
    return result.length > 0;
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra types
  async putMany(entries: any[]) {
    for (const entry of entries) {
      // oxlint-disable-next-line no-await-in-loop -- sequential DB writes via upsert
      await this.put(entry);
    }
  }

  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- Mastra types
  async getMany(hashes: string[]): Promise<Map<string, any>> {
    if (hashes.length === 0) return new Map();
    const rows = await this.db.select().from(skillBlobs).where(inArray(skillBlobs.hash, hashes));
    const map = new Map();
    for (const row of rows) {
      map.set(row.hash, row);
    }
    return map;
  }
}
