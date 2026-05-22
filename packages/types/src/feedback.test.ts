import { describe, expect, it } from 'vitest';

import { createFeedbackSchema, feedbackRatingEnum, feedbackSchema } from './feedback';

// =============================================================================
// feedbackRatingEnum
// =============================================================================

describe('feedbackRatingEnum', () => {
  it.each(['positive', 'negative'] as const)('parses "%s"', (rating) => {
    expect(feedbackRatingEnum.parse(rating)).toBe(rating);
  });

  it('rejects unknown rating', () => {
    expect(feedbackRatingEnum.safeParse('neutral').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(feedbackRatingEnum.safeParse('').success).toBe(false);
  });
});

// =============================================================================
// feedbackSchema
// =============================================================================

describe('feedbackSchema', () => {
  const validFeedback = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    threadId: 'thread-1',
    messageId: 'msg-1',
    userId: 'user-1',
    rating: 'positive' as const,
    createdAt: new Date('2024-01-01'),
  };

  it('parses valid feedback with defaults', () => {
    const result = feedbackSchema.parse(validFeedback);
    expect(result.id).toBe(validFeedback.id);
    expect(result.rating).toBe('positive');
    expect(result.comment).toBeNull();
  });

  it('parses feedback with comment', () => {
    const result = feedbackSchema.parse({ ...validFeedback, comment: 'Great answer!' });
    expect(result.comment).toBe('Great answer!');
  });

  it('accepts null comment', () => {
    const result = feedbackSchema.parse({ ...validFeedback, comment: null });
    expect(result.comment).toBeNull();
  });

  it('rejects missing threadId', () => {
    const { threadId: _, ...noThread } = validFeedback;
    expect(feedbackSchema.safeParse(noThread).success).toBe(false);
  });

  it('rejects missing messageId', () => {
    const { messageId: _, ...noMsg } = validFeedback;
    expect(feedbackSchema.safeParse(noMsg).success).toBe(false);
  });

  it('rejects missing userId', () => {
    const { userId: _, ...noUser } = validFeedback;
    expect(feedbackSchema.safeParse(noUser).success).toBe(false);
  });

  it('rejects missing rating', () => {
    const { rating: _, ...noRating } = validFeedback;
    expect(feedbackSchema.safeParse(noRating).success).toBe(false);
  });

  it('rejects invalid uuid for id', () => {
    expect(feedbackSchema.safeParse({ ...validFeedback, id: 'not-uuid' }).success).toBe(false);
  });

  it('rejects missing createdAt', () => {
    const { createdAt: _, ...noDate } = validFeedback;
    expect(feedbackSchema.safeParse(noDate).success).toBe(false);
  });
});

// =============================================================================
// createFeedbackSchema
// =============================================================================

describe('createFeedbackSchema', () => {
  const validCreate = {
    threadId: 'thread-1',
    messageId: 'msg-1',
    userId: 'user-1',
    rating: 'negative' as const,
  };

  it('parses valid create input', () => {
    const result = createFeedbackSchema.parse(validCreate);
    expect(result.threadId).toBe('thread-1');
    expect(result.rating).toBe('negative');
    expect(result.comment).toBeNull();
  });

  it('omits id field', () => {
    const result = createFeedbackSchema.safeParse({ ...validCreate, id: '550e8400-e29b-41d4-a716-446655440000' });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).id).toBeUndefined();
  });

  it('omits createdAt field', () => {
    const result = createFeedbackSchema.safeParse({ ...validCreate, createdAt: new Date() });
    expect(result.success).toBe(true);
    expect((result.data as Record<string, unknown>).createdAt).toBeUndefined();
  });

  it('accepts optional comment', () => {
    const result = createFeedbackSchema.parse({ ...validCreate, comment: 'Bad response' });
    expect(result.comment).toBe('Bad response');
  });

  it('rejects missing required fields', () => {
    expect(createFeedbackSchema.safeParse({}).success).toBe(false);
    expect(createFeedbackSchema.safeParse({ threadId: 'x' }).success).toBe(false);
  });
});
