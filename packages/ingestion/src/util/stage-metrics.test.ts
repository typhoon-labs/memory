import { describe, expect, it, vi } from 'vitest';

const { mockRecord } = vi.hoisted(() => ({
  mockRecord: vi.fn(),
}));

vi.mock('@typhoon/telemetry', () => ({
  syncStageDuration: { record: mockRecord },
}));

import { recordStageDuration } from './stage-metrics';

describe('recordStageDuration', () => {
  it('records duration with stage attribute', () => {
    recordStageDuration('chunk', 1234);
    expect(mockRecord).toHaveBeenCalledWith(1234, { stage: 'chunk' });
  });

  it('passes different stage names correctly', () => {
    recordStageDuration('embed', 500);
    expect(mockRecord).toHaveBeenCalledWith(500, { stage: 'embed' });
  });
});
