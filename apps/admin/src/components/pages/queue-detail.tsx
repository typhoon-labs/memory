import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
  apiFetch,
  Button,
  LoadingSpinner,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@typhoon/ui';
import { ChevronRightIcon, PauseIcon, PlayIcon } from 'lucide-react';
import { detailTitle, usePageTitle } from '../../hooks/use-page-title';
import { FailedJobsTab } from './queue-detail/failed-jobs-tab';
import { JobsTab } from './queue-detail/jobs-tab';
import { OverviewTab } from './queue-detail/overview-tab';
import type { JobState, QueueSummary } from './queue-detail/shared';
import { JOB_STATES } from './queue-detail/shared';

export function QueueDetailPage() {
  const { queueName } = useParams({ strict: false }) as { queueName: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  usePageTitle(detailTitle('Queues', queueName));

  const { data: queues, isLoading } = useQuery<QueueSummary[]>({
    queryKey: ['queues'],
    queryFn: () => apiFetch('/api/v1/queues'),
    refetchInterval: 60_000,
  });

  const queue = queues?.find((q) => q.name === queueName);
  const { tab: activeTab, jobState } = useSearch({ strict: false }) as { tab: string; jobState: JobState };

  function setActiveTab(tab: string) {
    navigate({ to: '/queues/$queueName', params: { queueName }, search: { tab, jobState } });
  }

  function setJobState(state: JobState) {
    navigate({ to: '/queues/$queueName', params: { queueName }, search: { tab: activeTab, jobState: state } });
  }

  const pauseMutation = useMutation({
    mutationFn: () => apiFetch(`/api/v1/queues/${queueName}/pause`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queues'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiFetch(`/api/v1/queues/${queueName}/resume`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queues'] }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!queue) {
    return <div className="p-8 text-center text-muted-foreground">Queue not found.</div>;
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-5xl">
        <PageHeader
          title={
            <span className="flex items-center gap-1.5">
              <Link to="/queues" className="text-muted-foreground transition-colors hover:text-foreground">
                Queues
              </Link>
              <ChevronRightIcon className="size-3.5 text-muted-foreground/50" />
              {queue.name}
            </span>
          }
          description={
            <StatusBadge variant={queue.isPaused ? 'pending' : 'success'}>
              {queue.isPaused ? 'Paused' : 'Active'}
            </StatusBadge>
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => (queue.isPaused ? resumeMutation.mutate() : pauseMutation.mutate())}
              disabled={pauseMutation.isPending || resumeMutation.isPending}
            >
              {queue.isPaused ? (
                <>
                  <PlayIcon className="mr-1.5 size-3.5" />
                  Resume
                </>
              ) : (
                <>
                  <PauseIcon className="mr-1.5 size-3.5" />
                  Pause
                </>
              )}
            </Button>
          }
        />

        <div className="mt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="jobs">Jobs</TabsTrigger>
                <TabsTrigger value="failed-archive">Failed Archive</TabsTrigger>
              </TabsList>
              {activeTab === 'jobs' && (
                <Select value={jobState} onValueChange={(v) => setJobState(v as JobState)}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_STATES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <TabsContent value="overview" className="mt-4">
              <OverviewTab queue={queue} />
            </TabsContent>
            <TabsContent value="jobs" className="mt-4">
              <JobsTab queueName={queueName} jobState={jobState} />
            </TabsContent>
            <TabsContent value="failed-archive" className="mt-4">
              <FailedJobsTab queueName={queueName} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
