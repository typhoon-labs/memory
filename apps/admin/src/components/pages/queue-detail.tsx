import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import {
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
import { JobsTab } from './queue-detail/jobs-tab.js';
import { OverviewTab } from './queue-detail/overview-tab.js';
import type { JobState, QueueSummary } from './queue-detail/shared.js';
import { JOB_STATES } from './queue-detail/shared.js';

export function QueueDetailPage() {
  const { queueName } = useParams({ strict: false }) as { queueName: string };
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: queues, isLoading } = useQuery<QueueSummary[]>({
    queryKey: ['queues'],
    queryFn: () => fetch('/api/v1/queues', { credentials: 'include' }).then((r) => r.json()),
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
    mutationFn: () =>
      fetch(`/api/v1/queues/${queueName}/pause`, { method: 'POST', credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error('Pause failed');
        return r.json();
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queues'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/v1/queues/${queueName}/resume`, { method: 'POST', credentials: 'include' }).then((r) => {
        if (!r.ok) throw new Error('Resume failed');
        return r.json();
      }),
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
              <a
                href="/queues"
                onClick={(e) => {
                  e.preventDefault();
                  navigate({ to: '/queues' });
                }}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Queues
              </a>
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
          </Tabs>
        </div>
      </div>
    </div>
  );
}
