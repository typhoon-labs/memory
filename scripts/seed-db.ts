/**
 * Database seed script — populates the database with sample data for development.
 *
 * Usage: bun run seed:db
 *
 * Idempotent: checks for a sentinel record before inserting. Safe to run multiple times.
 * Does NOT seed: users (OIDC), agents (defined in code), or embeddings (use seed:docs + sync).
 */
import { createDb, documents, messages, syncTargets, threads } from '@typhoon/db';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';
const db = createDb(DATABASE_URL);

// Fixed UUIDs for deterministic, repeatable seeding
const IDS = {
  syncTarget1: '00000000-5eed-0000-0000-000000000001',
  syncTarget2: '00000000-5eed-0000-0000-000000000002',
  doc1: '00000000-5eed-0001-0000-000000000001',
  doc2: '00000000-5eed-0001-0000-000000000002',
  doc3: '00000000-5eed-0001-0000-000000000003',
  doc4: '00000000-5eed-0001-0000-000000000004',
  doc5: '00000000-5eed-0001-0000-000000000005',
  thread1: '00000000-5eed-0002-0000-000000000001',
  thread2: '00000000-5eed-0002-0000-000000000002',
  thread3: '00000000-5eed-0002-0000-000000000003',
  msg1: '00000000-5eed-0003-0000-000000000001',
  msg2: '00000000-5eed-0003-0000-000000000002',
  msg3: '00000000-5eed-0003-0000-000000000003',
  msg4: '00000000-5eed-0003-0000-000000000004',
  msg5: '00000000-5eed-0003-0000-000000000005',
  msg6: '00000000-5eed-0003-0000-000000000006',
  msg7: '00000000-5eed-0003-0000-000000000007',
  msg8: '00000000-5eed-0003-0000-000000000008',
  msg9: '00000000-5eed-0003-0000-000000000009',
  msg10: '00000000-5eed-0003-0000-000000000010',
};

// Check idempotency — if sentinel sync target exists, skip
const existing = await db.select().from(syncTargets).where(eq(syncTargets.id, IDS.syncTarget1));
if (existing.length > 0) {
  console.log('Seed data already exists — skipping.');
  process.exit(0);
}

console.log('Seeding database...');

const now = new Date();

// 1. Sync targets
await db.insert(syncTargets).values([
  {
    id: IDS.syncTarget1,
    name: 'Support Docs',
    sourceType: 's3',
    config: { bucket: 'typhoon-documents', prefix: 'support/' },
    cronSchedule: '0 */6 * * *',
    isActive: true,
  },
  {
    id: IDS.syncTarget2,
    name: 'Product Guides',
    sourceType: 's3',
    config: { bucket: 'typhoon-documents', prefix: 'guides/' },
    cronSchedule: '0 0 * * *',
    isActive: true,
  },
]);
console.log('  2 sync targets');

// 2. Documents
await db.insert(documents).values([
  {
    id: IDS.doc1,
    syncTargetId: IDS.syncTarget1,
    sourceKey: 'support/getting-started.md',
    mimeType: 'text/markdown',
    fileSize: 12_400,
    title: 'Getting Started Guide',
    status: 'ready',
    chunkCount: 8,
    contentHash: '5eed-hash-001',
    lastSyncedAt: now,
  },
  {
    id: IDS.doc2,
    syncTargetId: IDS.syncTarget1,
    sourceKey: 'support/password-reset.md',
    mimeType: 'text/markdown',
    fileSize: 4_200,
    title: 'Password Reset Instructions',
    status: 'ready',
    chunkCount: 3,
    contentHash: '5eed-hash-002',
    lastSyncedAt: now,
  },
  {
    id: IDS.doc3,
    syncTargetId: IDS.syncTarget1,
    sourceKey: 'support/billing-faq.pdf',
    mimeType: 'application/pdf',
    fileSize: 89_000,
    title: 'Billing FAQ',
    pageCount: 5,
    status: 'ready',
    chunkCount: 15,
    contentHash: '5eed-hash-003',
    lastSyncedAt: now,
  },
  {
    id: IDS.doc4,
    syncTargetId: IDS.syncTarget2,
    sourceKey: 'guides/admin-handbook.pdf',
    mimeType: 'application/pdf',
    fileSize: 210_000,
    title: 'Administrator Handbook',
    pageCount: 24,
    status: 'ready',
    chunkCount: 42,
    contentHash: '5eed-hash-004',
    lastSyncedAt: now,
  },
  {
    id: IDS.doc5,
    syncTargetId: IDS.syncTarget2,
    sourceKey: 'guides/api-reference.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileSize: 54_000,
    title: 'API Reference',
    pageCount: 12,
    status: 'ready',
    chunkCount: 20,
    contentHash: '5eed-hash-005',
    lastSyncedAt: now,
  },
]);
console.log('  5 documents');

// 3. Threads
const RESOURCE_ID = '5eed-user';

await db.insert(threads).values([
  {
    id: IDS.thread1,
    externalId: '5eed-thread-password-reset',
    resourceId: RESOURCE_ID,
    title: 'How do I reset my password?',
    metadata: {},
  },
  {
    id: IDS.thread2,
    externalId: '5eed-thread-billing',
    resourceId: RESOURCE_ID,
    title: 'Billing cycle question',
    metadata: {},
  },
  {
    id: IDS.thread3,
    externalId: '5eed-thread-api',
    resourceId: RESOURCE_ID,
    title: 'API rate limits',
    metadata: {},
  },
]);
console.log('  3 threads');

// 4. Messages
await db.insert(messages).values([
  // Thread 1: Password reset
  {
    id: IDS.msg1,
    externalId: '5eed-msg-001',
    threadId: IDS.thread1,
    role: 'user',
    type: 'text',
    content: { type: 'text', text: "How do I reset my password? I forgot it and can't log in." },
    resourceId: RESOURCE_ID,
    createdAt: new Date(now.getTime() - 600_000),
  },
  {
    id: IDS.msg2,
    externalId: '5eed-msg-002',
    threadId: IDS.thread1,
    role: 'assistant',
    type: 'text',
    content: {
      type: 'text',
      text: 'To reset your password, go to the login page and click "Forgot Password". You\'ll receive an email with a reset link. The link expires after 24 hours. [Source: 1]',
    },
    createdAt: new Date(now.getTime() - 590_000),
  },
  {
    id: IDS.msg3,
    externalId: '5eed-msg-003',
    threadId: IDS.thread1,
    role: 'user',
    type: 'text',
    content: { type: 'text', text: "What if I don't receive the email?" },
    resourceId: RESOURCE_ID,
    createdAt: new Date(now.getTime() - 580_000),
  },
  {
    id: IDS.msg4,
    externalId: '5eed-msg-004',
    threadId: IDS.thread1,
    role: 'assistant',
    type: 'text',
    content: {
      type: 'text',
      text: "Check your spam/junk folder first. If the email still hasn't arrived after 5 minutes, you can request another reset link. If the problem persists, contact support at support@example.com. [Source: 1]",
    },
    createdAt: new Date(now.getTime() - 570_000),
  },
  // Thread 2: Billing
  {
    id: IDS.msg5,
    externalId: '5eed-msg-005',
    threadId: IDS.thread2,
    role: 'user',
    type: 'text',
    content: { type: 'text', text: 'When does my billing cycle reset? I signed up mid-month.' },
    resourceId: RESOURCE_ID,
    createdAt: new Date(now.getTime() - 300_000),
  },
  {
    id: IDS.msg6,
    externalId: '5eed-msg-006',
    threadId: IDS.thread2,
    role: 'assistant',
    type: 'text',
    content: {
      type: 'text',
      text: "Your billing cycle starts on the day you signed up and renews monthly on that same date. If you signed up on the 15th, you'll be billed on the 15th of each month. Your first bill is prorated for the remaining days in the month. [Source: 2]",
    },
    createdAt: new Date(now.getTime() - 290_000),
  },
  // Thread 3: API rate limits
  {
    id: IDS.msg7,
    externalId: '5eed-msg-007',
    threadId: IDS.thread3,
    role: 'user',
    type: 'text',
    content: { type: 'text', text: 'What are the API rate limits for the free tier?' },
    resourceId: RESOURCE_ID,
    createdAt: new Date(now.getTime() - 120_000),
  },
  {
    id: IDS.msg8,
    externalId: '5eed-msg-008',
    threadId: IDS.thread3,
    role: 'assistant',
    type: 'text',
    content: {
      type: 'text',
      text: 'The free tier allows 100 requests per minute and 10,000 requests per day. Each request has a maximum payload size of 1MB. If you need higher limits, consider upgrading to the Pro tier which offers 1,000 requests per minute. [Source: 3]',
    },
    createdAt: new Date(now.getTime() - 110_000),
  },
  {
    id: IDS.msg9,
    externalId: '5eed-msg-009',
    threadId: IDS.thread3,
    role: 'user',
    type: 'text',
    content: { type: 'text', text: 'Is there a way to monitor my current usage?' },
    resourceId: RESOURCE_ID,
    createdAt: new Date(now.getTime() - 100_000),
  },
  {
    id: IDS.msg10,
    externalId: '5eed-msg-010',
    threadId: IDS.thread3,
    role: 'assistant',
    type: 'text',
    content: {
      type: 'text',
      text: 'Yes, you can check your API usage in the admin dashboard under Settings > API Usage. It shows real-time request counts, remaining quota, and historical usage charts. You can also set up alerts when you reach 80% of your limit. [Source: 3]',
    },
    createdAt: new Date(now.getTime() - 90_000),
  },
]);
console.log('  10 messages');

console.log('');
console.log('Database seeded successfully.');
console.log('  Sync targets: 2 (Support Docs, Product Guides)');
console.log('  Documents:    5 (markdown, PDF, DOCX)');
console.log('  Threads:      3 (password reset, billing, API)');
console.log('  Messages:     10 (user + assistant pairs)');
console.log('');
console.log('Note: Feedback requires a logged-in user. Log in via SSO first,');
console.log('then use the UI to leave feedback on messages.');

process.exit(0);
