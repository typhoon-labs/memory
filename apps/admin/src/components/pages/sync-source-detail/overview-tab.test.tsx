import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/ui', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/ui')>('@typhoon/ui');
  return { ...actual, apiFetch: vi.fn() };
});

import { apiFetch } from '@typhoon/ui';

import { renderWithQueryClient } from '../../../test-utils';
import { OverviewTab } from './overview-tab';
import type { SyncTarget } from './shared';

const mockApiFetch = vi.mocked(apiFetch) as any as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const baseTarget: SyncTarget = {
  id: 'st-1',
  name: 'Test Source',
  sourceType: 's3',
  config: { prefix: 'docs/' },
  isActive: true,
  cronSchedule: '0 */6 * * *',
  managedBy: null,
  source: 's3-default',
  metadataTemplateId: null,
  autoExtractMetadata: false,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('OverviewTab', () => {
  it('renders source configuration details', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    expect(screen.getByText('Source Configuration')).toBeTruthy();
    expect(screen.getByText('s3')).toBeTruthy();
    expect(screen.getByText('s3://my-bucket/docs/')).toBeTruthy();
    expect(screen.getByText('0 */6 * * *')).toBeTruthy();
    expect(screen.getByText('Manual')).toBeTruthy();
  });

  it('renders stat cards with document counts', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents')) {
        return Promise.resolve([
          { id: 'd1', status: 'ready' },
          { id: 'd2', status: 'ready' },
          { id: 'd3', status: 'error' },
          { id: 'd4', status: 'processing' },
          { id: 'd5', status: 'deleted' },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    await waitFor(() => {
      expect(screen.getByText('Total Documents')).toBeTruthy();
      expect(screen.getByText('Ready')).toBeTruthy();
      expect(screen.getByText('Errors')).toBeTruthy();
      expect(screen.getByText('Processing')).toBeTruthy();
    });
  });

  it('shows "No sync jobs yet." when no jobs exist', async () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    await waitFor(() => {
      expect(screen.getByText('No sync jobs yet.')).toBeTruthy();
    });
  });

  it('renders last sync job info when jobs exist', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/jobs')) {
        return Promise.resolve([
          {
            id: 'job-1',
            syncTargetId: 'st-1',
            status: 'completed',
            filesScanned: 10,
            filesNew: 3,
            filesUpdated: 2,
            filesDeleted: 1,
            filesErrored: 0,
            childJobsTotal: 0,
            childJobsCompleted: 0,
            errorMessage: null,
            startedAt: '2025-06-01T10:00:00Z',
            completedAt: '2025-06-01T10:05:00Z',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    await waitFor(() => {
      expect(screen.getByText('Last Sync')).toBeTruthy();
      expect(screen.getByText('completed')).toBeTruthy();
      expect(screen.getByText('Scanned')).toBeTruthy();
    });
  });

  it('renders credential source when present', () => {
    mockApiFetch.mockResolvedValue([]);
    const targetWithSource = { ...baseTarget, source: 'aws-integration' };
    renderWithQueryClient(<OverviewTab sourceId="st-1" target={targetWithSource} />);

    expect(screen.getByText('Credential Source')).toBeTruthy();
    expect(screen.getByText('aws-integration')).toBeTruthy();
  });

  it('renders metadata settings section', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    expect(screen.getByText('Metadata Settings')).toBeTruthy();
  });

  it('renders stat card values for document counts', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents')) {
        return Promise.resolve([
          { id: 'd1', status: 'ready' },
          { id: 'd2', status: 'ready' },
          { id: 'd3', status: 'ready' },
          { id: 'd4', status: 'error' },
          { id: 'd5', status: 'processing' },
          { id: 'd6', status: 'pending' },
          { id: 'd7', status: 'deleted' },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    await waitFor(() => {
      // Total = 6 (excludes deleted)
      expect(screen.getByText('6')).toBeTruthy();
      // Ready = 3
      expect(screen.getByText('3')).toBeTruthy();
      // Errors = 1
      expect(screen.getByText('1')).toBeTruthy();
      // Processing = 2 (processing + pending)
      expect(screen.getByText('2')).toBeTruthy();
    });
  });

  it('renders last sync job file counts', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/jobs')) {
        return Promise.resolve([
          {
            id: 'job-1',
            syncTargetId: 'st-1',
            status: 'completed',
            filesScanned: 25,
            filesNew: 5,
            filesUpdated: 10,
            filesDeleted: 2,
            filesErrored: 0,
            childJobsTotal: 0,
            childJobsCompleted: 0,
            errorMessage: null,
            startedAt: '2025-06-01T10:00:00Z',
            completedAt: '2025-06-01T10:05:00Z',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    await waitFor(() => {
      expect(screen.getByText('25')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy();
      expect(screen.getByText('10')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
    });
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('Updated')).toBeTruthy();
    expect(screen.getByText('Deleted')).toBeTruthy();
    // "Errors" appears both as stat card label and sync job detail
    expect(screen.getAllByText('Errors').length).toBeGreaterThanOrEqual(1);
  });

  it('renders error message for failed last sync job', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/jobs')) {
        return Promise.resolve([
          {
            id: 'job-1',
            syncTargetId: 'st-1',
            status: 'failed',
            filesScanned: 0,
            filesNew: 0,
            filesUpdated: 0,
            filesDeleted: 0,
            filesErrored: 3,
            childJobsTotal: 0,
            childJobsCompleted: 0,
            errorMessage: 'S3 access denied: check credentials',
            startedAt: '2025-06-01T10:00:00Z',
            completedAt: '2025-06-01T10:00:05Z',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    await waitFor(() => {
      expect(screen.getByText('failed')).toBeTruthy();
      expect(screen.getByText('S3 access denied: check credentials')).toBeTruthy();
    });
  });

  it('renders managedBy value when set', () => {
    mockApiFetch.mockResolvedValue([]);
    const targetWithMgmt = { ...baseTarget, managedBy: 'config' };
    renderWithQueryClient(<OverviewTab sourceId="st-1" target={targetWithMgmt} />);

    expect(screen.getByText('config')).toBeTruthy();
  });

  it('renders metadata template selector with None option', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    expect(screen.getByText('Metadata Template')).toBeTruthy();
  });

  it('renders auto-extract checkbox when template is set', () => {
    mockApiFetch.mockResolvedValue([]);
    const targetWithTemplate = { ...baseTarget, metadataTemplateId: 'tmpl-1' };
    renderWithQueryClient(<OverviewTab sourceId="st-1" target={targetWithTemplate} />);

    expect(screen.getByText('Auto-extract metadata from document content (uses LLM)')).toBeTruthy();
  });

  it('picks most recent job as last sync', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/jobs')) {
        return Promise.resolve([
          {
            id: 'job-old',
            syncTargetId: 'st-1',
            status: 'completed',
            filesScanned: 1,
            filesNew: 0,
            filesUpdated: 0,
            filesDeleted: 0,
            filesErrored: 0,
            childJobsTotal: 0,
            childJobsCompleted: 0,
            errorMessage: null,
            startedAt: '2025-01-01T10:00:00Z',
            completedAt: '2025-01-01T10:05:00Z',
          },
          {
            id: 'job-new',
            syncTargetId: 'st-1',
            status: 'completed',
            filesScanned: 50,
            filesNew: 10,
            filesUpdated: 20,
            filesDeleted: 5,
            filesErrored: 0,
            childJobsTotal: 0,
            childJobsCompleted: 0,
            errorMessage: null,
            startedAt: '2025-06-15T10:00:00Z',
            completedAt: '2025-06-15T10:10:00Z',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    await waitFor(() => {
      // Most recent job should show 50 scanned files
      expect(screen.getByText('50')).toBeTruthy();
    });
  });

  it('renders config details with created date', () => {
    mockApiFetch.mockResolvedValue([]);
    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    expect(screen.getByText('Source Type')).toBeTruthy();
    expect(screen.getByText('Path')).toBeTruthy();
    expect(screen.getByText('Schedule')).toBeTruthy();
    expect(screen.getByText('Managed By')).toBeTruthy();
    expect(screen.getByText('Created')).toBeTruthy();
  });

  it('does not show credential source when source is null', () => {
    mockApiFetch.mockResolvedValue([]);
    const targetNoSource = { ...baseTarget, source: null };
    renderWithQueryClient(<OverviewTab sourceId="st-1" target={targetNoSource} sourceBucket="my-bucket" />);

    expect(screen.queryByText('Credential Source')).toBeNull();
  });

  it('shows amber dirty docs banner when documents have searchMetaDirty', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents')) {
        return Promise.resolve([
          { id: 'd1', status: 'ready', searchMetaDirty: true },
          { id: 'd2', status: 'ready', searchMetaDirty: true },
          { id: 'd3', status: 'ready', searchMetaDirty: false },
          { id: 'd4', status: 'error', searchMetaDirty: false },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    await waitFor(() => {
      expect(screen.getByText(/2 document\(s\)/)).toBeTruthy();
      expect(screen.getByText(/outdated search indexes/)).toBeTruthy();
    });
  });

  it('does not show dirty docs banner when no documents are dirty', async () => {
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/documents')) {
        return Promise.resolve([
          { id: 'd1', status: 'ready', searchMetaDirty: false },
          { id: 'd2', status: 'ready', searchMetaDirty: false },
        ]);
      }
      return Promise.resolve([]);
    });

    renderWithQueryClient(<OverviewTab sourceId="st-1" target={baseTarget} sourceBucket="my-bucket" />);

    await waitFor(() => {
      expect(screen.getByText('Ready')).toBeTruthy();
    });

    expect(screen.queryByText(/outdated search indexes/)).toBeNull();
  });
});
