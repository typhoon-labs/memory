import { useQuery } from '@tanstack/react-query';
import { apiFetch, formatAbsoluteTime, formatRelativeTime, SectionLabel, StatCard, StatusBadge } from '@typhoon/ui';
import { AlertTriangleIcon, CheckCircleIcon, FileTextIcon, LoaderIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { Document, SyncJob, SyncTarget } from './shared';
import { formatConfig, formatDuration, JOB_STATUS_MAP } from './shared';

export function OverviewTab({ sourceId, target }: { sourceId: string; target: SyncTarget }) {
  const { data: docs } = useQuery<Document[]>({
    queryKey: ['documents', { syncTargetId: sourceId }],
    queryFn: () => apiFetch(`/api/v1/documents?syncTargetId=${sourceId}`),
  });

  const { data: jobs } = useQuery<SyncJob[]>({
    queryKey: ['sync-targets', sourceId, 'jobs'],
    queryFn: () => apiFetch(`/api/v1/sync-targets/${sourceId}/jobs`),
  });

  const stats = useMemo(() => {
    if (!docs) return { total: 0, ready: 0, errors: 0, processing: 0 };
    return {
      total: docs.filter((d) => d.status !== 'deleted').length,
      ready: docs.filter((d) => d.status === 'ready').length,
      errors: docs.filter((d) => d.status === 'parse_error' || d.status === 'embed_error').length,
      processing: docs.filter((d) => d.status === 'processing' || d.status === 'pending').length,
    };
  }, [docs]);

  const lastJob = useMemo(() => {
    if (!jobs || jobs.length === 0) return null;
    return [...jobs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  }, [jobs]);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Documents" value={stats.total} icon={<FileTextIcon className="size-4" />} />
        <StatCard label="Ready" value={stats.ready} icon={<CheckCircleIcon className="size-4" />} />
        <StatCard label="Errors" value={stats.errors} icon={<AlertTriangleIcon className="size-4" />} />
        <StatCard label="Processing" value={stats.processing} icon={<LoaderIcon className="size-4" />} />
      </div>

      {/* Source Configuration */}
      <div>
        <SectionLabel>Source Configuration</SectionLabel>
        <div className="mt-2 rounded-lg border border-border bg-card p-4">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Source Type</dt>
              <dd className="mt-0.5 font-medium">{target.sourceType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Path</dt>
              <dd className="mt-0.5 font-medium">{formatConfig(target.sourceType, target.config)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Schedule</dt>
              <dd className="mt-0.5 font-medium">{target.cronSchedule}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Managed By</dt>
              <dd className="mt-0.5 font-medium">{target.managedBy ?? 'Manual'}</dd>
            </div>
            {target.source && (
              <div>
                <dt className="text-muted-foreground">Credential Source</dt>
                <dd className="mt-0.5 font-medium">{target.source}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="mt-0.5 font-medium">{formatAbsoluteTime(target.createdAt)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Last Sync */}
      <div>
        <SectionLabel>Last Sync</SectionLabel>
        {lastJob ? (
          <div className="mt-2 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <StatusBadge variant={JOB_STATUS_MAP[lastJob.status]}>{lastJob.status}</StatusBadge>
              <span className="text-sm text-muted-foreground">{formatRelativeTime(lastJob.startedAt)}</span>
              <span className="text-sm text-muted-foreground">
                {formatDuration(lastJob.startedAt, lastJob.completedAt)}
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm sm:grid-cols-5">
              <div>
                <dt className="text-muted-foreground">Scanned</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{lastJob.filesScanned}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">New</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{lastJob.filesNew}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{lastJob.filesUpdated}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Deleted</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{lastJob.filesDeleted}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Errors</dt>
                <dd className={`mt-0.5 font-medium tabular-nums ${lastJob.filesErrored > 0 ? 'text-red-400' : ''}`}>
                  {lastJob.filesErrored}
                </dd>
              </div>
            </dl>

            {lastJob.status === 'failed' && lastJob.errorMessage && (
              <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {lastJob.errorMessage}
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No sync jobs yet.</p>
        )}
      </div>
    </div>
  );
}
