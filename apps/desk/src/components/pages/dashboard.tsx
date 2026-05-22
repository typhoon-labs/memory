import { useQuery } from '@tanstack/react-query';
import { apiFetch, StatCard, useAuth } from '@typhoon/ui';
import { CalendarIcon, FileTextIcon, MessageSquareIcon, ThumbsUpIcon } from 'lucide-react';

import { usePageTitle } from '../../hooks/use-page-title';
import type { ThreadListResponse } from '../chat/use-thread';
import { ConversationActivity } from '../dashboard/conversation-activity';
import { ConversationVolume } from '../dashboard/conversation-volume';
import { QuickAccess } from '../dashboard/quick-access';
import { WidgetCard } from '../dashboard/widget-card';

interface DocumentItem {
  status: string;
}

interface FeedbackEntry {
  id: string;
  rating: 'positive' | 'negative';
  createdAt: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  usePageTitle('Dashboard');
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0];

  const docs = useQuery({
    queryKey: ['documents'],
    queryFn: () => apiFetch<DocumentItem[]>('/api/v1/documents'),
  });

  const threads = useQuery({
    queryKey: ['threads', 'dashboard'],
    queryFn: () => apiFetch<ThreadListResponse>('/api/v1/threads?perPage=20'),
  });

  const feedback = useQuery<FeedbackEntry[]>({
    queryKey: ['feedback', 'all'],
    queryFn: () => apiFetch<FeedbackEntry[]>('/api/v1/feedback').catch(() => []),
    staleTime: 60_000,
  });

  const readyCount = docs.data?.filter((d) => d.status === 'ready').length ?? 0;
  const threadList = threads.data?.threads ?? [];

  const todayStart = new Date().setHours(0, 0, 0, 0);
  const todayCount = threadList.filter((t) => new Date(t.createdAt).getTime() >= todayStart).length;

  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const recentFeedback = feedback.data?.filter((f) => new Date(f.createdAt).getTime() >= thirtyDaysAgo) ?? [];
  const positiveCount = recentFeedback.filter((f) => f.rating === 'positive').length;
  const totalFeedback = recentFeedback.length;
  const positivePercent = totalFeedback > 0 ? Math.round((positiveCount / totalFeedback) * 100) : null;

  return (
    <div className="overflow-y-auto p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Greeting + quick actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {getGreeting()}
              {firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-muted-foreground text-sm">Overview of your knowledge base and conversations</p>
          </div>
          <QuickAccess />
        </div>

        {/* Stat cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Conversations"
            value={threads.data?.total ?? '—'}
            icon={<MessageSquareIcon className="size-4" />}
          />
          <StatCard label="Today" value={todayCount} icon={<CalendarIcon className="size-4" />} />
          <StatCard
            label="Satisfaction"
            value={positivePercent !== null ? `${positivePercent}%` : '—'}
            icon={<ThumbsUpIcon className="size-4" />}
          />
          <StatCard
            label="Documents"
            value={docs.data?.length ?? '—'}
            description={`${readyCount} ready`}
            icon={<FileTextIcon className="size-4" />}
          />
        </div>

        {/* Row 2: Activity + Volume */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <WidgetCard title="Conversation Activity">
            <ConversationActivity threads={threadList} isLoading={threads.isLoading} />
          </WidgetCard>
          <WidgetCard title="Conversation Volume">
            <ConversationVolume threads={threadList} />
          </WidgetCard>
        </div>
      </div>
    </div>
  );
}
