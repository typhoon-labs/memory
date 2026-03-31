import { z } from 'zod';

export const feedbackRatingEnum = z.enum(['positive', 'negative']);

export type FeedbackRating = z.infer<typeof feedbackRatingEnum>;

export const feedbackSchema = z.object({
  id: z.string().uuid(),
  threadId: z.string(),
  messageId: z.string(),
  userId: z.string(),
  rating: feedbackRatingEnum,
  comment: z.string().nullable().default(null),
  createdAt: z.date(),
});

export type Feedback = z.infer<typeof feedbackSchema>;

export const createFeedbackSchema = feedbackSchema.omit({
  id: true,
  createdAt: true,
});

export type CreateFeedback = z.infer<typeof createFeedbackSchema>;
