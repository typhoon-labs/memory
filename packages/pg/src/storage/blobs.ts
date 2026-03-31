import { BlobStore } from '@mastra/core/storage';
import type { Sql } from 'postgres';

export class DrizzleBlobsStorage extends BlobStore {
  constructor(private sql: Sql) {
    super();
  }

  async init() {}

  async dangerouslyClearAll() {
    await this.sql.unsafe(`DELETE FROM "skill_blobs"`);
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra StorageBlobEntry type
  async put(entry: any) {
    await this.sql.unsafe(
      `INSERT INTO "skill_blobs" (hash, content, size, mime_type, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (hash) DO NOTHING`,
      [entry.hash, entry.content, entry.size ?? 0, entry.mimeType ?? null, new Date()],
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async get(hash: string): Promise<any> {
    const [row] = await this.sql.unsafe(`SELECT * FROM "skill_blobs" WHERE hash = $1`, [hash]);
    return row ?? null;
  }

  async has(hash: string): Promise<boolean> {
    const [row] = await this.sql.unsafe(`SELECT 1 FROM "skill_blobs" WHERE hash = $1 LIMIT 1`, [hash]);
    return !!row;
  }

  async delete(hash: string): Promise<boolean> {
    const result = await this.sql.unsafe(`DELETE FROM "skill_blobs" WHERE hash = $1`, [hash]);
    return result.count > 0;
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async putMany(entries: any[]) {
    for (const entry of entries) {
      await this.put(entry);
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: Mastra types
  async getMany(hashes: string[]): Promise<Map<string, any>> {
    if (hashes.length === 0) return new Map();
    const placeholders = hashes.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await this.sql.unsafe(`SELECT * FROM "skill_blobs" WHERE hash IN (${placeholders})`, hashes);
    const map = new Map();
    for (const row of rows) {
      map.set((row as Record<string, string>).hash, row);
    }
    return map;
  }
}
