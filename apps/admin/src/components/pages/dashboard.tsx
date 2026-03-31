import { useQuery } from '@tanstack/react-query';
import { PageHeader, StatCard } from '@typhoon/ui';
import { AlertTriangleIcon, FileTextIcon, FolderSyncIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';

export function AdminDashboard() {
  const docs = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/v1/documents', { credentials: 'include' }).then((r) => r.json()),
  });

  const targets = useQuery({
    queryKey: ['sync-targets'],
    queryFn: () => fetch('/api/v1/sync-targets', { credentials: 'include' }).then((r) => r.json()),
  });

  const fb = useQuery({
    queryKey: ['feedback'],
    queryFn: () => fetch('/api/v1/feedback', { credentials: 'include' }).then((r) => r.json()),
  });

  const readyCount = docs.data?.filter((d: { status: string }) => d.status === 'ready').length ?? 0;
  const errorCount = docs.data?.filter((d: { status: string }) => d.status === 'parse_error').length ?? 0;
  const positiveCount = fb.data?.filter((f: { rating: string }) => f.rating === 'positive').length ?? 0;
  const negativeCount = fb.data?.filter((f: { rating: string }) => f.rating === 'negative').length ?? 0;

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Admin Dashboard" description="System overview and key metrics" />

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Sync Sources"
            value={targets.data?.length ?? '\u2014'}
            icon={<FolderSyncIcon className="size-4" />}
          />
          <StatCard
            label="Documents"
            value={docs.data?.length ?? '\u2014'}
            icon={<FileTextIcon className="size-4" />}
          />
          <StatCard
            label="Ready"
            value={readyCount}
            trend={readyCount > 0 ? 'up' : undefined}
            icon={<FileTextIcon className="size-4" />}
          />
          <StatCard
            label="Errors"
            value={errorCount}
            trend={errorCount > 0 ? 'down' : undefined}
            icon={<AlertTriangleIcon className="size-4" />}
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard label="Positive Feedback" value={positiveCount} icon={<ThumbsUpIcon className="size-4" />} />
          <StatCard label="Negative Feedback" value={negativeCount} icon={<ThumbsDownIcon className="size-4" />} />
        </div>
      </div>
    </div>
  );
}
