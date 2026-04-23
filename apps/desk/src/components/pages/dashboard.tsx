import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { apiFetch, Button, PageHeader, StatCard } from '@typhoon/ui';
import { FileTextIcon, MessageSquareIcon, SearchIcon } from 'lucide-react';

export function DashboardPage() {
  const docs = useQuery({
    queryKey: ['documents'],
    queryFn: () => apiFetch<{ status: string }[]>('/api/v1/documents'),
  });

  const syncTargets = useQuery({
    queryKey: ['sync-targets'],
    queryFn: () => apiFetch<{ id: string }[]>('/api/v1/sync-targets'),
  });

  const readyCount = docs.data?.filter((d: { status: string }) => d.status === 'ready').length ?? 0;

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Dashboard" description="Overview of your knowledge base" />

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Documents" value={docs.data?.length ?? '—'} icon={<FileTextIcon className="size-4" />} />
          <StatCard label="Sync Sources" value={syncTargets.data?.length ?? '—'} />
          <StatCard label="Ready" value={readyCount} trend={readyCount > 0 ? 'up' : undefined} />
        </div>

        <div className="mt-6 flex gap-3">
          <Button asChild>
            <Link to="/chat">
              <MessageSquareIcon className="mr-2 size-4" />
              Start Chat
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/search">
              <SearchIcon className="mr-2 size-4" />
              Search KB
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
