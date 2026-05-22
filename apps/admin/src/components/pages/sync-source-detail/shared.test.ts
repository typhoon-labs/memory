import { describe, expect, it } from 'vitest';

import { DOC_STATUS_MAP, formatBytes, formatConfig, formatCron, formatDuration, JOB_STATUS_MAP } from './shared';

// ── formatConfig ───────────────────────────────────────────────

describe('formatConfig', () => {
  it('formats s3 config with sourceBucket and prefix', () => {
    expect(formatConfig('s3', { prefix: 'data/' }, 'my-bucket')).toBe('s3://my-bucket/data/');
  });

  it('formats s3 config without prefix', () => {
    expect(formatConfig('s3', {}, 'my-bucket')).toBe('s3://my-bucket/');
  });

  it('shows "unknown" when sourceBucket is not provided', () => {
    expect(formatConfig('s3', { prefix: 'data/' })).toBe('s3://unknown/data/');
  });

  it('returns JSON for non-s3 source types', () => {
    const config = { url: 'https://example.com' };
    expect(formatConfig('web', config)).toBe(JSON.stringify(config));
  });

  it('returns JSON for unknown source types', () => {
    const config = { path: '/local' };
    expect(formatConfig('local', config)).toBe(JSON.stringify(config));
  });
});

// ── formatDuration ─────────────────────────────────────────────

describe('formatDuration', () => {
  it('returns "Running..." when completedAt is null', () => {
    expect(formatDuration('2025-01-01T00:00:00Z', null)).toBe('Running...');
  });

  it('formats milliseconds for short durations', () => {
    expect(formatDuration('2025-01-01T00:00:00.000Z', '2025-01-01T00:00:00.500Z')).toBe('500ms');
  });

  it('formats seconds for durations under a minute', () => {
    expect(formatDuration('2025-01-01T00:00:00Z', '2025-01-01T00:00:30Z')).toBe('30s');
  });

  it('formats minutes and seconds for longer durations', () => {
    expect(formatDuration('2025-01-01T00:00:00Z', '2025-01-01T00:02:05Z')).toBe('2m 5s');
  });

  it('formats exactly one minute', () => {
    expect(formatDuration('2025-01-01T00:00:00Z', '2025-01-01T00:01:00Z')).toBe('1m 0s');
  });
});

// ── formatCron ─────────────────────────────────────────────────

describe('formatCron', () => {
  it('returns "Every minute" for * * * * *', () => {
    expect(formatCron('* * * * *')).toBe('Every minute');
  });

  it('returns "Every minute" for */1 * * * *', () => {
    expect(formatCron('*/1 * * * *')).toBe('Every minute');
  });

  it('returns "Every N minutes" for */N * * * *', () => {
    expect(formatCron('*/5 * * * *')).toBe('Every 5 minutes');
    expect(formatCron('*/15 * * * *')).toBe('Every 15 minutes');
  });

  it('returns "Every hour" for 0 */1 * * *', () => {
    expect(formatCron('0 */1 * * *')).toBe('Every hour');
  });

  it('returns "Every N hours" for 0 */N * * *', () => {
    expect(formatCron('0 */2 * * *')).toBe('Every 2 hours');
    expect(formatCron('0 */6 * * *')).toBe('Every 6 hours');
  });

  it('returns human-readable time for daily crons', () => {
    expect(formatCron('0 8 * * *')).toBe('Daily at 8:00 AM');
    expect(formatCron('30 14 * * *')).toBe('Daily at 2:30 PM');
    expect(formatCron('0 0 * * *')).toBe('Daily at 12:00 AM');
    expect(formatCron('0 12 * * *')).toBe('Daily at 12:00 PM');
  });

  it('returns raw cron for non-standard patterns', () => {
    expect(formatCron('0 8 1 * *')).toBe('0 8 1 * *');
    expect(formatCron('0 8 * * 1')).toBe('0 8 * * 1');
  });

  it('returns raw cron for malformed expressions', () => {
    expect(formatCron('invalid')).toBe('invalid');
    expect(formatCron('* * *')).toBe('* * *');
  });
});

// ── formatBytes ────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(2621440)).toBe('2.5 MB');
    expect(formatBytes(10485760)).toBe('10.0 MB');
  });
});

// ── Constants ──────────────────────────────────────────────────

describe('JOB_STATUS_MAP', () => {
  it('maps running to warning', () => {
    expect(JOB_STATUS_MAP.running).toBe('warning');
  });

  it('maps completed to success', () => {
    expect(JOB_STATUS_MAP.completed).toBe('success');
  });

  it('maps failed to error', () => {
    expect(JOB_STATUS_MAP.failed).toBe('error');
  });

  it('maps cancelled to pending', () => {
    expect(JOB_STATUS_MAP.cancelled).toBe('pending');
  });
});

describe('DOC_STATUS_MAP', () => {
  it('maps ready to success', () => {
    expect(DOC_STATUS_MAP.ready).toBe('success');
  });

  it('maps processing to warning', () => {
    expect(DOC_STATUS_MAP.processing).toBe('warning');
  });

  it('maps pending to pending', () => {
    expect(DOC_STATUS_MAP.pending).toBe('pending');
  });

  it('maps error to error', () => {
    expect(DOC_STATUS_MAP.error).toBe('error');
  });

  it('maps deleted to pending', () => {
    expect(DOC_STATUS_MAP.deleted).toBe('pending');
  });
});
