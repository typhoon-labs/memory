/**
 * Seed script — populates datasets, experiments, and scores for the evals UI.
 *
 * Usage: bun run seed:evals
 *
 * Idempotent: checks for a sentinel dataset before inserting. Safe to run multiple times.
 * Depends on: seed:scorers (scorer definitions must exist).
 */
import { createDb, datasetItems, datasets, datasetVersions, experimentResults, experiments, scores } from '@typhoon/db';
import { eq } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';
const db = createDb(DATABASE_URL);

// ── Fixed UUIDs ────────────────────────────────────────────────────

const IDS = {
  // Datasets
  dataset1: '00000000-e1a1-0001-0000-000000000001',
  dataset2: '00000000-e1a1-0001-0000-000000000002',

  // Dataset versions
  dsVersion1: '00000000-e1a1-0002-0000-000000000001',
  dsVersion2: '00000000-e1a1-0002-0000-000000000002',

  // Dataset 1 items (Customer Support QA, 10 items)
  item1_01: '00000000-e1a1-0010-0000-000000000001',
  item1_02: '00000000-e1a1-0010-0000-000000000002',
  item1_03: '00000000-e1a1-0010-0000-000000000003',
  item1_04: '00000000-e1a1-0010-0000-000000000004',
  item1_05: '00000000-e1a1-0010-0000-000000000005',
  item1_06: '00000000-e1a1-0010-0000-000000000006',
  item1_07: '00000000-e1a1-0010-0000-000000000007',
  item1_08: '00000000-e1a1-0010-0000-000000000008',
  item1_09: '00000000-e1a1-0010-0000-000000000009',
  item1_10: '00000000-e1a1-0010-0000-000000000010',

  // Dataset 2 items (Product Knowledge QA, 8 items)
  item2_01: '00000000-e1a1-0011-0000-000000000001',
  item2_02: '00000000-e1a1-0011-0000-000000000002',
  item2_03: '00000000-e1a1-0011-0000-000000000003',
  item2_04: '00000000-e1a1-0011-0000-000000000004',
  item2_05: '00000000-e1a1-0011-0000-000000000005',
  item2_06: '00000000-e1a1-0011-0000-000000000006',
  item2_07: '00000000-e1a1-0011-0000-000000000007',
  item2_08: '00000000-e1a1-0011-0000-000000000008',

  // Experiments
  exp1: '00000000-e1a1-0020-0000-000000000001',
  exp2: '00000000-e1a1-0020-0000-000000000002',

  // Experiment 1 results (10 results)
  res1_01: '00000000-e1a1-0030-0000-000000000001',
  res1_02: '00000000-e1a1-0030-0000-000000000002',
  res1_03: '00000000-e1a1-0030-0000-000000000003',
  res1_04: '00000000-e1a1-0030-0000-000000000004',
  res1_05: '00000000-e1a1-0030-0000-000000000005',
  res1_06: '00000000-e1a1-0030-0000-000000000006',
  res1_07: '00000000-e1a1-0030-0000-000000000007',
  res1_08: '00000000-e1a1-0030-0000-000000000008',
  res1_09: '00000000-e1a1-0030-0000-000000000009',
  res1_10: '00000000-e1a1-0030-0000-000000000010',

  // Experiment 2 results (8 results)
  res2_01: '00000000-e1a1-0031-0000-000000000001',
  res2_02: '00000000-e1a1-0031-0000-000000000002',
  res2_03: '00000000-e1a1-0031-0000-000000000003',
  res2_04: '00000000-e1a1-0031-0000-000000000004',
  res2_05: '00000000-e1a1-0031-0000-000000000005',
  res2_06: '00000000-e1a1-0031-0000-000000000006',
  res2_07: '00000000-e1a1-0031-0000-000000000007',
  res2_08: '00000000-e1a1-0031-0000-000000000008',
};

// ── Sentinel check ─────────────────────────────────────────────────

const existing = await db.select().from(datasets).where(eq(datasets.id, IDS.dataset1));
if (existing.length > 0) {
  console.log('Eval seed data already exists — skipping.');
  process.exit(0);
}

console.log('Seeding eval data...');

const now = new Date();
const twoHoursAgo = new Date(now.getTime() - 7_200_000);
const oneHourAgo = new Date(now.getTime() - 3_600_000);
const fiftyMinAgo = new Date(now.getTime() - 3_000_000);

// ── Dataset item definitions ───────────────────────────────────────

const DS1_ITEMS = [
  {
    id: IDS.item1_01,
    question: 'How do I reset my password?',
    answer:
      'Go to the login page, click "Forgot Password", enter your email, and follow the link in the reset email. The link expires after 24 hours.',
  },
  {
    id: IDS.item1_02,
    question: 'What are your support hours?',
    answer:
      'Our support team is available Monday through Friday, 9 AM to 6 PM EST. Weekend support is available for Enterprise plan customers.',
  },
  {
    id: IDS.item1_03,
    question: 'How do I cancel my subscription?',
    answer:
      'Navigate to Settings > Billing > Cancel Subscription. Your access continues until the end of the current billing period.',
  },
  {
    id: IDS.item1_04,
    question: 'Can I get a refund?',
    answer:
      'We offer full refunds within 14 days of purchase. After 14 days, we can provide a prorated refund for unused time on annual plans.',
  },
  {
    id: IDS.item1_05,
    question: 'How do I add a team member?',
    answer:
      'Go to Settings > Team > Invite Member. Enter their email address and select a role. They will receive an invitation email.',
  },
  {
    id: IDS.item1_06,
    question: 'What payment methods do you accept?',
    answer:
      'We accept Visa, Mastercard, American Express, and PayPal. Enterprise customers can pay by invoice with NET-30 terms.',
  },
  {
    id: IDS.item1_07,
    question: 'How do I export my data?',
    answer:
      'Go to Settings > Data > Export. Select the data types you want and click Export. You will receive a download link via email within 24 hours.',
  },
  {
    id: IDS.item1_08,
    question: 'Is there a mobile app?',
    answer:
      'Yes, we offer native apps for iOS and Android. Download from the App Store or Google Play. All features are available on mobile.',
  },
  {
    id: IDS.item1_09,
    question: 'How do I enable two-factor authentication?',
    answer:
      'Go to Settings > Security > Two-Factor Authentication. You can use an authenticator app or SMS verification. We recommend using an authenticator app.',
  },
  {
    id: IDS.item1_10,
    question: 'What is your uptime SLA?',
    answer:
      'We guarantee 99.9% uptime for all paid plans. Enterprise plans include a 99.99% SLA with financial credits for any downtime.',
  },
];

const DS2_ITEMS = [
  {
    id: IDS.item2_01,
    question: 'What are the API rate limits?',
    answer:
      'Free tier: 100 requests/minute, 10,000/day. Pro tier: 1,000 requests/minute, 100,000/day. Enterprise: custom limits.',
  },
  {
    id: IDS.item2_02,
    question: 'How does the search indexing work?',
    answer:
      'Documents are chunked, embedded using a vector model, and stored in a vector database. Search uses cosine similarity to find the most relevant chunks.',
  },
  {
    id: IDS.item2_03,
    question: 'What file formats are supported for document upload?',
    answer: 'We support PDF, DOCX, Markdown, plain text, HTML, and CSV. Maximum file size is 50MB per document.',
  },
  {
    id: IDS.item2_04,
    question: 'How do webhooks work?',
    answer:
      'Configure webhook endpoints in Settings > Integrations. We send POST requests with JSON payloads for events like document.synced and message.created.',
  },
  {
    id: IDS.item2_05,
    question: 'What LLM models are available?',
    answer:
      'We support GPT-4o, Claude Sonnet, and Claude Haiku. Enterprise customers can bring their own API keys for additional models.',
  },
  {
    id: IDS.item2_06,
    question: 'How does the RAG pipeline process documents?',
    answer:
      'Documents are ingested, split into chunks of ~500 tokens with 50-token overlap, embedded, and indexed. At query time, the top-k chunks are retrieved and passed as context to the LLM.',
  },
  {
    id: IDS.item2_07,
    question: 'What analytics are available?',
    answer:
      'The dashboard shows message volume, response latency, user satisfaction scores, and top questions. All metrics can be exported as CSV.',
  },
  {
    id: IDS.item2_08,
    question: 'How does memory work across conversations?',
    answer:
      'Each thread maintains its own conversation history. The system uses a sliding window of recent messages plus a summary of older messages for context.',
  },
];

// ── Agent responses (slightly imperfect paraphrases for realistic scores) ──

const EXP1_RESPONSES: Array<{ responseText: string; scores: Array<{ name: string; score: number }> } | null> = [
  {
    responseText:
      'To reset your password, visit the login page and click the "Forgot Password" link. Enter your email and you\'ll get a reset link. Note that the link is valid for 24 hours.',
    scores: [
      { name: 'faithfulness', score: 0.94 },
      { name: 'hallucination', score: 0.96 },
      { name: 'answerRelevancy', score: 0.91 },
      { name: 'contextRelevance', score: 0.88 },
      { name: 'contextPrecision', score: 0.85 },
    ],
  },
  {
    responseText:
      'Support is available weekdays from 9 AM to 6 PM Eastern time. Enterprise customers also get weekend support.',
    scores: [
      { name: 'faithfulness', score: 0.91 },
      { name: 'hallucination', score: 0.93 },
      { name: 'answerRelevancy', score: 0.89 },
      { name: 'contextRelevance', score: 0.82 },
      { name: 'contextPrecision', score: 0.78 },
    ],
  },
  {
    responseText:
      "You can cancel by going to Settings, then Billing, and selecting Cancel Subscription. You'll keep access through your current billing period.",
    scores: [
      { name: 'faithfulness', score: 0.93 },
      { name: 'hallucination', score: 0.95 },
      { name: 'answerRelevancy', score: 0.92 },
      { name: 'contextRelevance', score: 0.86 },
      { name: 'contextPrecision', score: 0.83 },
    ],
  },
  {
    responseText:
      'Refunds are available within 14 days of purchase. For annual plans, a prorated refund may be available after that period.',
    scores: [
      { name: 'faithfulness', score: 0.88 },
      { name: 'hallucination', score: 0.9 },
      { name: 'answerRelevancy', score: 0.85 },
      { name: 'contextRelevance', score: 0.79 },
      { name: 'contextPrecision', score: 0.76 },
    ],
  },
  {
    responseText:
      'To add a team member, navigate to Settings > Team > Invite Member, type their email, pick their role, and send the invite.',
    scores: [
      { name: 'faithfulness', score: 0.95 },
      { name: 'hallucination', score: 0.97 },
      { name: 'answerRelevancy', score: 0.93 },
      { name: 'contextRelevance', score: 0.9 },
      { name: 'contextPrecision', score: 0.87 },
    ],
  },
  {
    responseText:
      'We accept major credit cards including Visa and Mastercard. PayPal is also supported. Enterprise accounts can use invoice billing.',
    scores: [
      { name: 'faithfulness', score: 0.82 },
      { name: 'hallucination', score: 0.85 },
      { name: 'answerRelevancy', score: 0.88 },
      { name: 'contextRelevance', score: 0.51 },
      { name: 'contextPrecision', score: 0.48 },
    ],
  },
  // Item 7 — failed (timeout)
  null,
  {
    responseText:
      'Yes! We have mobile apps for both iOS and Android. You can download them from the App Store or Google Play. The mobile experience includes all the features available on desktop.',
    scores: [
      { name: 'faithfulness', score: 0.96 },
      { name: 'hallucination', score: 0.98 },
      { name: 'answerRelevancy', score: 0.94 },
      { name: 'contextRelevance', score: 0.91 },
      { name: 'contextPrecision', score: 0.89 },
    ],
  },
  {
    responseText:
      'Two-factor authentication can be set up under Settings > Security. You can choose between an authenticator app or SMS codes. An authenticator app is the recommended option for better security.',
    scores: [
      { name: 'faithfulness', score: 0.92 },
      { name: 'hallucination', score: 0.94 },
      { name: 'answerRelevancy', score: 0.9 },
      { name: 'contextRelevance', score: 0.84 },
      { name: 'contextPrecision', score: 0.81 },
    ],
  },
  {
    responseText:
      'All paid plans come with a 99.9% uptime guarantee. If you need higher availability, Enterprise plans offer 99.99% SLA with financial credits for downtime events.',
    scores: [
      { name: 'faithfulness', score: 0.93 },
      { name: 'hallucination', score: 0.95 },
      { name: 'answerRelevancy', score: 0.91 },
      { name: 'contextRelevance', score: 0.87 },
      { name: 'contextPrecision', score: 0.84 },
    ],
  },
];

const EXP2_RESPONSES: Array<{ responseText: string; scores: Array<{ name: string; score: number }> }> = [
  {
    responseText:
      'Rate limits depend on your plan. Free tier gets 100 requests per minute and 10,000 per day. Pro bumps that to 1,000/minute and 100,000/day. Enterprise limits are negotiable.',
    scores: [
      { name: 'faithfulness', score: 0.93 },
      { name: 'hallucination', score: 0.95 },
      { name: 'answerRelevancy', score: 0.92 },
      { name: 'contextRelevance', score: 0.89 },
      { name: 'contextPrecision', score: 0.86 },
    ],
  },
  {
    responseText:
      'Search indexing splits documents into chunks, generates vector embeddings, and stores them in a vector database. When you search, we use cosine similarity to rank and return the best-matching chunks.',
    scores: [
      { name: 'faithfulness', score: 0.91 },
      { name: 'hallucination', score: 0.93 },
      { name: 'answerRelevancy', score: 0.94 },
      { name: 'contextRelevance', score: 0.85 },
      { name: 'contextPrecision', score: 0.82 },
    ],
  },
  {
    responseText:
      'You can upload PDF, Word (DOCX), Markdown, plain text, HTML, and CSV files. The maximum size per file is 50MB.',
    scores: [
      { name: 'faithfulness', score: 0.95 },
      { name: 'hallucination', score: 0.97 },
      { name: 'answerRelevancy', score: 0.93 },
      { name: 'contextRelevance', score: 0.9 },
      { name: 'contextPrecision', score: 0.88 },
    ],
  },
  {
    responseText:
      'Webhooks let you receive real-time notifications. Set up endpoints in Settings under Integrations. We send JSON POST requests for events such as when documents finish syncing or new messages arrive.',
    scores: [
      { name: 'faithfulness', score: 0.89 },
      { name: 'hallucination', score: 0.91 },
      { name: 'answerRelevancy', score: 0.87 },
      { name: 'contextRelevance', score: 0.58 },
      { name: 'contextPrecision', score: 0.55 },
    ],
  },
  {
    responseText:
      'Currently we support GPT-4o, Claude Sonnet, and Claude Haiku out of the box. Enterprise users can plug in their own API keys to use other models.',
    scores: [
      { name: 'faithfulness', score: 0.92 },
      { name: 'hallucination', score: 0.94 },
      { name: 'answerRelevancy', score: 0.9 },
      { name: 'contextRelevance', score: 0.86 },
      { name: 'contextPrecision', score: 0.83 },
    ],
  },
  {
    responseText:
      'The RAG pipeline works in stages: first documents are ingested and split into roughly 500-token chunks with overlap. These get embedded and indexed. At query time we retrieve the most relevant chunks and feed them as context to the language model.',
    scores: [
      { name: 'faithfulness', score: 0.94 },
      { name: 'hallucination', score: 0.96 },
      { name: 'answerRelevancy', score: 0.95 },
      { name: 'contextRelevance', score: 0.91 },
      { name: 'contextPrecision', score: 0.89 },
    ],
  },
  {
    responseText:
      'The analytics dashboard tracks message volume, response times, satisfaction ratings, and frequently asked questions. You can export everything to CSV for further analysis.',
    scores: [
      { name: 'faithfulness', score: 0.9 },
      { name: 'hallucination', score: 0.92 },
      { name: 'answerRelevancy', score: 0.88 },
      { name: 'contextRelevance', score: 0.83 },
      { name: 'contextPrecision', score: 0.8 },
    ],
  },
  {
    responseText:
      'Conversation memory is per-thread. We keep a sliding window of the most recent messages and generate summaries of older messages so the model always has relevant context without exceeding token limits.',
    scores: [
      { name: 'faithfulness', score: 0.88 },
      { name: 'hallucination', score: 0.86 },
      { name: 'answerRelevancy', score: 0.91 },
      { name: 'contextRelevance', score: 0.62 },
      { name: 'contextPrecision', score: 0.59 },
    ],
  },
];

// ── Score reasons per scorer ───────────────────────────────────────

function scoreReason(scorer: string, score: number): string {
  const quality = score >= 0.85 ? 'high' : score >= 0.7 ? 'moderate' : 'low';
  const reasons: Record<string, Record<string, string>> = {
    faithfulness: {
      high: 'The response accurately reflects the information from the provided context documents without adding unsupported claims.',
      moderate:
        'The response mostly follows the source material but includes minor restatements that slightly drift from the original.',
      low: 'The response diverges from the context in several places, introducing claims not directly supported by the sources.',
    },
    hallucination: {
      high: 'No fabricated information detected. All claims in the response can be traced back to the source documents.',
      moderate:
        'The response is mostly grounded but includes one or two details that may not be directly sourced from context.',
      low: 'Several details in the response appear to be fabricated or not grounded in the provided context.',
    },
    answerRelevancy: {
      high: "The response directly and completely addresses the user's question with relevant information.",
      moderate: 'The response addresses the main question but includes some tangential information.',
      low: 'The response only partially addresses the question and misses key aspects the user was asking about.',
    },
    contextRelevance: {
      high: 'The retrieved context chunks are highly relevant to the question and contain the information needed to answer.',
      moderate: 'Most retrieved chunks are relevant, though some contain only marginally useful information.',
      low: 'Several retrieved chunks are not relevant to the question, suggesting retrieval could be improved.',
    },
    contextPrecision: {
      high: 'All retrieved context is actively used in forming the answer with minimal noise.',
      moderate: 'Most retrieved context contributes to the answer, with some unused chunks.',
      low: 'A significant portion of retrieved context is unused, indicating over-retrieval for this query.',
    },
  };
  return reasons[scorer]?.[quality] ?? 'Score assessed based on standard evaluation criteria.';
}

// ── Helper: generate a score UUID ──────────────────────────────────

let scoreCounter = 0;
function scoreId(): string {
  scoreCounter++;
  return `00000000-e1a1-0040-0000-${String(scoreCounter).padStart(12, '0')}`;
}

// ── 1. Datasets ────────────────────────────────────────────────────

await db.insert(datasets).values([
  {
    id: IDS.dataset1,
    name: 'Customer Support QA',
    description: 'Common customer support questions with expected answers for evaluating agent accuracy.',
    version: 0,
    createdAt: twoHoursAgo,
    updatedAt: twoHoursAgo,
  },
  {
    id: IDS.dataset2,
    name: 'Product Knowledge QA',
    description: 'Technical product questions testing agent knowledge of platform features and architecture.',
    version: 0,
    createdAt: twoHoursAgo,
    updatedAt: twoHoursAgo,
  },
]);
console.log('  2 datasets');

// ── 2. Dataset versions ────────────────────────────────────────────

await db.insert(datasetVersions).values([
  { id: IDS.dsVersion1, datasetId: IDS.dataset1, version: 0, createdAt: twoHoursAgo },
  { id: IDS.dsVersion2, datasetId: IDS.dataset2, version: 0, createdAt: twoHoursAgo },
]);
console.log('  2 dataset versions');

// ── 3. Dataset items ───────────────────────────────────────────────

await db.insert(datasetItems).values(
  DS1_ITEMS.map((item) => ({
    id: item.id,
    datasetId: IDS.dataset1,
    datasetVersion: 0,
    input: { question: item.question },
    groundTruth: { answer: item.answer },
    createdAt: twoHoursAgo,
    updatedAt: twoHoursAgo,
  })),
);

await db.insert(datasetItems).values(
  DS2_ITEMS.map((item) => ({
    id: item.id,
    datasetId: IDS.dataset2,
    datasetVersion: 0,
    input: { question: item.question },
    groundTruth: { answer: item.answer },
    createdAt: twoHoursAgo,
    updatedAt: twoHoursAgo,
  })),
);
console.log('  18 dataset items (10 + 8)');

// ── 4. Experiments ─────────────────────────────────────────────────

const exp1End = new Date(oneHourAgo.getTime() + 30_000);
const exp2End = new Date(fiftyMinAgo.getTime() + 24_000);

await db.insert(experiments).values([
  {
    id: IDS.exp1,
    name: 'Baseline — Customer Support QA',
    description: 'Initial baseline run of the support agent against the Customer Support QA dataset.',
    datasetId: IDS.dataset1,
    datasetVersion: 0,
    targetType: 'agent',
    targetId: 'typhoon-supervisor',
    status: 'completed',
    totalItems: 10,
    succeededCount: 9,
    failedCount: 1,
    skippedCount: 0,
    startedAt: oneHourAgo,
    completedAt: exp1End,
    createdAt: oneHourAgo,
    updatedAt: exp1End,
  },
  {
    id: IDS.exp2,
    name: 'Baseline — Product Knowledge QA',
    description: 'Initial baseline run of the support agent against the Product Knowledge QA dataset.',
    datasetId: IDS.dataset2,
    datasetVersion: 0,
    targetType: 'agent',
    targetId: 'typhoon-supervisor',
    status: 'completed',
    totalItems: 8,
    succeededCount: 8,
    failedCount: 0,
    skippedCount: 0,
    startedAt: fiftyMinAgo,
    completedAt: exp2End,
    createdAt: fiftyMinAgo,
    updatedAt: exp2End,
  },
]);
console.log('  2 experiments');

// ── 5. Experiment results ──────────────────────────────────────────

const exp1ResultIds = [
  IDS.res1_01,
  IDS.res1_02,
  IDS.res1_03,
  IDS.res1_04,
  IDS.res1_05,
  IDS.res1_06,
  IDS.res1_07,
  IDS.res1_08,
  IDS.res1_09,
  IDS.res1_10,
];

const exp2ResultIds = [
  IDS.res2_01,
  IDS.res2_02,
  IDS.res2_03,
  IDS.res2_04,
  IDS.res2_05,
  IDS.res2_06,
  IDS.res2_07,
  IDS.res2_08,
];

// Experiment 1 results
await db.insert(experimentResults).values(
  DS1_ITEMS.map((item, i) => {
    const started = new Date(oneHourAgo.getTime() + i * 3000);
    const completed = new Date(started.getTime() + 2500);
    const response = EXP1_RESPONSES[i];

    return {
      id: exp1ResultIds[i],
      experimentId: IDS.exp1,
      itemId: item.id,
      itemDatasetVersion: 0,
      input: { question: item.question },
      output: response ?? undefined,
      groundTruth: { answer: item.answer },
      error: response === null ? { message: 'Agent execution timed out after 30s', code: 'TIMEOUT' } : undefined,
      startedAt: started,
      completedAt: completed,
      retryCount: 0,
    };
  }),
);

// Experiment 2 results
await db.insert(experimentResults).values(
  DS2_ITEMS.map((item, i) => {
    const started = new Date(fiftyMinAgo.getTime() + i * 3000);
    const completed = new Date(started.getTime() + 2500);
    return {
      id: exp2ResultIds[i],
      experimentId: IDS.exp2,
      itemId: item.id,
      itemDatasetVersion: 0,
      input: { question: item.question },
      output: EXP2_RESPONSES[i],
      groundTruth: { answer: item.answer },
      startedAt: started,
      completedAt: completed,
      retryCount: 0,
    };
  }),
);
console.log('  18 experiment results (17 succeeded, 1 failed)');

// ── 6. Scores ──────────────────────────────────────────────────────

const scoreRecords: Array<{
  id: string;
  scorerId: string;
  runId: string;
  entityId: string;
  entityType: string;
  source: string;
  score: number;
  reason: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}> = [];

// Experiment 1 scores (skip item 7 — failed)
for (let i = 0; i < DS1_ITEMS.length; i++) {
  const response = EXP1_RESPONSES[i];
  if (!response) continue;
  for (const entry of response.scores) {
    scoreRecords.push({
      id: scoreId(),
      scorerId: entry.name,
      runId: IDS.exp1,
      entityId: exp1ResultIds[i],
      entityType: 'experiment_result',
      source: 'experiment',
      score: entry.score,
      reason: scoreReason(entry.name, entry.score),
      input: { question: DS1_ITEMS[i].question },
      output: { responseText: response.responseText },
    });
  }
}

// Experiment 2 scores
for (let i = 0; i < DS2_ITEMS.length; i++) {
  const response = EXP2_RESPONSES[i];
  for (const entry of response.scores) {
    scoreRecords.push({
      id: scoreId(),
      scorerId: entry.name,
      runId: IDS.exp2,
      entityId: exp2ResultIds[i],
      entityType: 'experiment_result',
      source: 'experiment',
      score: entry.score,
      reason: scoreReason(entry.name, entry.score),
      input: { question: DS2_ITEMS[i].question },
      output: { responseText: response.responseText },
    });
  }
}

await db.insert(scores).values(scoreRecords);
console.log(`  ${scoreRecords.length} scores (${scoreRecords.length / 5} results x 5 scorers)`);

// ── Summary ────────────────────────────────────────────────────────

console.log('');
console.log('Eval data seeded successfully.');
console.log('  Datasets:           2 (Customer Support QA, Product Knowledge QA)');
console.log('  Dataset items:      18 (10 + 8)');
console.log('  Experiments:        2 (both completed)');
console.log('  Experiment results: 18 (17 succeeded, 1 failed)');
console.log(`  Scores:             ${scoreRecords.length}`);
console.log('');
console.log('Prerequisite: bun run seed:scorers (scorer definitions must exist)');

process.exit(0);
