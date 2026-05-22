/**
 * Seed sync targets.
 *
 * Idempotent: checks for a sentinel record before inserting.
 */
import { createDb, syncTargets } from '@typhoon/db';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';
const db = createDb(DATABASE_URL);

const IDS = {
  syncTarget1: '00000000-5eed-4000-8000-000000000001',
  syncTarget2: '00000000-5eed-4000-8000-000000000002',
};

const existing = await db.select().from(syncTargets).where(eq(syncTargets.id, IDS.syncTarget1));
if (existing.length > 0) {
  console.log('Sync targets already seeded — skipping.');
  process.exit(0);
}

await db.insert(syncTargets).values([
  {
    id: IDS.syncTarget1,
    name: 'Support Docs',
    sourceType: 's3',
    source: 's3-default',
    config: { prefix: 'support/' },
    cronSchedule: '0 */6 * * *',
    isActive: true,
  },
  {
    id: IDS.syncTarget2,
    name: 'Product Guides',
    sourceType: 's3',
    source: 's3-default',
    config: { prefix: 'guides/' },
    cronSchedule: '0 0 * * *',
    isActive: true,
  },
]);

console.log('  2 sync targets');

process.exit(0);
