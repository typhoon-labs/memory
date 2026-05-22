import { Tabs, TabsContent, TabsList, TabsTrigger } from '@typhoon/ui';

import { AnnotationPanel } from './annotation-panel';
import { ScorePanel } from './score-panel';
import type { ChatMessage, ReviewScore } from './shared';

interface ReviewPanelProps {
  threadId: string;
  message: ChatMessage;
  scores: ReviewScore[];
}

export function ReviewPanel({ threadId, message, scores }: ReviewPanelProps) {
  const annotations = scores.filter((s) => s.scorer_id === 'human-review');
  const automated = scores.filter((s) => s.scorer_id !== 'human-review');

  return (
    <Tabs defaultValue="scores">
      <div>
        <TabsList>
          <TabsTrigger value="scores" className="text-xs">
            Scores{automated.length > 0 ? ` (${automated.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="annotation" className="text-xs">
            Annotation{annotations.length > 0 ? ` (${annotations.length})` : ''}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="scores" className="pt-3">
        <ScorePanel scores={scores} messageCreatedAt={String(message.createdAt ?? '')} />
      </TabsContent>

      <TabsContent value="annotation" className="pt-3">
        <AnnotationPanel threadId={threadId} messageId={message.id} annotations={annotations} />
      </TabsContent>
    </Tabs>
  );
}
