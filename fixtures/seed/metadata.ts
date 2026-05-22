/**
 * Seed metadata field groups, templates, and sync target associations.
 *
 * Idempotent: checks for a sentinel record before inserting.
 * Depends on: sync-targets.ts (must run after sync targets are seeded).
 */
import { createDb, metadataFieldGroups, metadataTemplates, syncTargets } from '@typhoon/db';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';
const db = createDb(DATABASE_URL);

const IDS = {
  // Field groups (valid v4 UUIDs with version=4, variant=8)
  classification: '00000000-5eed-4004-8000-000000000001',
  regional: '00000000-5eed-4004-8000-000000000002',
  productContext: '00000000-5eed-4004-8000-000000000003',
  // Templates
  supportTemplate: '00000000-5eed-4005-8000-000000000001',
  productTemplate: '00000000-5eed-4005-8000-000000000002',
  // Sync targets (from sync-targets.ts)
  syncTarget1: '00000000-5eed-4000-8000-000000000001',
  syncTarget2: '00000000-5eed-4000-8000-000000000002',
};

const existing = await db.select().from(metadataFieldGroups).where(eq(metadataFieldGroups.id, IDS.classification));
if (existing.length > 0) {
  console.log('Metadata already seeded — skipping.');
  process.exit(0);
}

// ── Field Groups ──────────────────────────────────────────────────

await db.insert(metadataFieldGroups).values([
  {
    id: IDS.classification,
    name: 'Document Classification',
    description: 'Universal document type, audience, and topic categorization',
    fields: {
      documentType: {
        type: 'string',
        required: true,
        allowedValues: ['guide', 'faq', 'policy', 'troubleshooting', 'reference', 'sop'],
        description: 'The type/category of the document',
      },
      audience: {
        type: 'string',
        required: true,
        default: 'customer',
        allowedValues: ['customer', 'internal', 'partner'],
        description: 'The intended audience',
      },
      topicArea: {
        type: 'string[]',
        allowedValues: [
          'account',
          'billing',
          'sync',
          'security',
          'privacy',
          'shipping',
          'pricing',
          'troubleshooting',
          'onboarding',
          'compliance',
        ],
        description: 'Topic areas covered',
      },
    },
  },
  {
    id: IDS.regional,
    name: 'Regional Applicability',
    description: 'Geographic and regulatory scope of the document',
    fields: {
      region: {
        type: 'string[]',
        required: true,
        default: ['global'],
        allowedValues: ['global', 'us', 'eu', 'uk', 'apac'],
        description: 'Geographic regions this document applies to',
      },
      regulatoryFramework: {
        type: 'string[]',
        allowedValues: ['gdpr', 'ccpa', 'eu-consumer-rights', 'sox'],
        description: 'Regulatory frameworks referenced',
      },
    },
  },
  {
    id: IDS.productContext,
    name: 'Product Context',
    description: 'Product and pricing plan applicability',
    fields: {
      applicablePlans: {
        type: 'string[]',
        default: ['starter', 'professional', 'enterprise'],
        allowedValues: ['starter', 'professional', 'enterprise'],
        description: 'Which pricing plans this applies to',
      },
      product: {
        type: 'string',
        default: 'cloudvault',
        description: 'The product this document relates to',
      },
    },
  },
]);

console.log('  3 field groups');

// ── Templates ─────────────────────────────────────────────────────

await db.insert(metadataTemplates).values([
  {
    id: IDS.supportTemplate,
    name: 'Support Documentation',
    description: 'Template for support articles, policies, SOPs, and troubleshooting guides',
    fieldGroupIds: [IDS.classification, IDS.regional, IDS.productContext],
    customFields: {
      priority: {
        type: 'string',
        default: 'normal',
        allowedValues: ['low', 'normal', 'high', 'critical'],
        description: 'Priority level for support agents when referencing this document',
      },
    },
  },
  {
    id: IDS.productTemplate,
    name: 'Product Documentation',
    description: 'Template for product guides, FAQs, and reference materials',
    fieldGroupIds: [IDS.classification, IDS.productContext],
    customFields: {
      contentVersion: {
        type: 'string',
        description: 'The product version this documentation applies to (e.g., "4.2", "2026.1")',
      },
    },
  },
]);

console.log('  2 templates');

// ── Associate templates with sync targets ─────────────────────────

const [updated1] = await db
  .update(syncTargets)
  .set({ metadataTemplateId: IDS.supportTemplate, autoExtractMetadata: true })
  .where(eq(syncTargets.id, IDS.syncTarget1))
  .returning();

const [updated2] = await db
  .update(syncTargets)
  .set({ metadataTemplateId: IDS.productTemplate, autoExtractMetadata: true })
  .where(eq(syncTargets.id, IDS.syncTarget2))
  .returning();

if (!updated1) console.warn('  Warning: Support Docs sync target not found — template not assigned');
if (!updated2) console.warn('  Warning: Product Guides sync target not found — template not assigned');

const assigned = [updated1, updated2].filter(Boolean).length;
console.log(`  ${assigned} sync target(s) updated with template + auto-extract`);

process.exit(0);
