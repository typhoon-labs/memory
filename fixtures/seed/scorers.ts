/**
 * Seed script — populates the database with the 5 standard RAG scorer definitions.
 *
 * Usage: bun run seed:scorers
 *
 * Idempotent: checks for a sentinel scorer before inserting. Safe to run multiple times.
 * Creates each scorer as an active definition with version 1.
 */

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';

// Use dynamic import to load postgres from the workspace package
const postgres = (await import('postgres')).default;
const sql = postgres(DATABASE_URL);

// Fixed UUIDs for deterministic seeding
const SCORERS = [
  {
    defId: '00000000-0000-4000-a000-000000010001',
    verId: '00000000-0000-4000-b000-000000010001',
    name: 'faithfulness',
    type: 'faithfulness',
    description: 'Are answers grounded in retrieved context?',
  },
  {
    defId: '00000000-0000-4000-a000-000000010002',
    verId: '00000000-0000-4000-b000-000000010002',
    name: 'hallucination',
    type: 'hallucination',
    description: 'Is the agent fabricating information?',
  },
  {
    defId: '00000000-0000-4000-a000-000000010003',
    verId: '00000000-0000-4000-b000-000000010003',
    name: 'answerRelevancy',
    type: 'answerRelevancy',
    description: 'Does the answer address the question?',
  },
  {
    defId: '00000000-0000-4000-a000-000000010004',
    verId: '00000000-0000-4000-b000-000000010004',
    name: 'contextRelevance',
    type: 'contextRelevance',
    description: 'Are retrieved chunks relevant to the query?',
  },
  {
    defId: '00000000-0000-4000-a000-000000010005',
    verId: '00000000-0000-4000-b000-000000010005',
    name: 'contextPrecision',
    type: 'contextPrecision',
    description: 'Is all retrieved context actually needed?',
  },
];

// Check idempotency — if first scorer already exists, skip
const existing = await sql`SELECT id FROM scorer_definitions WHERE id = ${SCORERS[0].defId}`;
if (existing.length > 0) {
  console.log('Scorers already seeded, skipping.');
  await sql.end();
  process.exit(0);
}

const now = new Date().toISOString();

for (const scorer of SCORERS) {
  // Create definition
  // oxlint-disable-next-line no-await-in-loop -- sequential DB seeding: definition before version
  await sql`
    INSERT INTO scorer_definitions (id, status, active_version_id, created_at, updated_at)
    VALUES (${scorer.defId}, 'active', ${scorer.verId}, ${now}, ${now})
  `;

  // Create version 1
  // oxlint-disable-next-line no-await-in-loop -- sequential DB seeding: depends on definition above
  await sql`
    INSERT INTO scorer_definition_versions (id, scorer_definition_id, version_number, name, type, description, change_message, created_at)
    VALUES (${scorer.verId}, ${scorer.defId}, 1, ${scorer.name}, ${scorer.type}, ${scorer.description}, 'Initial version (seeded)', ${now})
  `;

  console.log(`  Seeded scorer: ${scorer.name}`);
}

console.log(`\nSeeded ${SCORERS.length} scorer definitions.`);
await sql.end();
