import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth';
import { messages } from './messages';
import { threads } from './threads';

export const feedbackRatingEnum = pgEnum('feedback_rating', ['positive', 'negative']);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    rating: feedbackRatingEnum('rating').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('feedback_thread_id_idx').on(table.threadId),
    index('feedback_message_id_idx').on(table.messageId),
    index('feedback_user_id_idx').on(table.userId),
    index('feedback_rating_idx').on(table.rating),
    index('feedback_thread_message_idx').on(table.threadId, table.messageId),
  ],
);
