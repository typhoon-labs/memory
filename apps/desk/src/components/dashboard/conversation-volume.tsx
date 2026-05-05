import type { ThreadListItem } from '../chat/use-thread';
import { VolumeChart } from './volume-chart';

interface ConversationVolumeProps {
  threads: ThreadListItem[];
}

/** 7-day conversation volume bar chart. */
export function ConversationVolume({ threads }: ConversationVolumeProps) {
  const volumeData = buildVolumeData(threads);
  return <VolumeChart data={volumeData} />;
}

function buildVolumeData(threads: ThreadListItem[]): Array<{ day: string; count: number }> {
  const days: Array<{ day: string; count: number }> = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayStr = date.toLocaleDateString(undefined, { weekday: 'short' });
    const dayStart = new Date(date).setHours(0, 0, 0, 0);
    const dayEnd = new Date(date).setHours(23, 59, 59, 999);
    const count = threads.filter((t) => {
      const ts = new Date(t.createdAt).getTime();
      return ts >= dayStart && ts <= dayEnd;
    }).length;
    days.push({ day: dayStr, count });
  }

  return days;
}
