import type { ToolExecutionContext } from '@mastra/core/tools';
import { createTool } from '@mastra/core/tools';
import { createTitleModel } from '@typhoon/ai';
import { generateText } from 'ai';
import { z } from 'zod';
import { emitToolProgress } from './with-progress';

const titleModel = createTitleModel();

export const setThreadTitle = createTool({
  id: 'setThreadTitle',
  description:
    'Generate and save a short title for the current conversation thread. Call this after responding to the first message in a new conversation.',
  inputSchema: z.object({
    userMessage: z.string().describe('The user message to generate a title from'),
  }),
  outputSchema: z.object({
    title: z.string(),
  }),
  execute: async ({ userMessage }, context) => {
    const threadId = (context as Record<string, unknown> & { agent?: { threadId?: string } })?.agent?.threadId;
    if (!threadId) return { title: '' };

    const mastra = context?.mastra;
    if (!mastra) return { title: '' };

    const storage = mastra.getStorage();
    if (!storage) return { title: '' };

    const memoryStore = await storage.getStore('memory');
    if (!memoryStore) return { title: '' };

    // Guard: skip if thread already has a title
    const thread = await memoryStore.getThreadById({ threadId });
    if (thread?.title) return { title: thread.title };

    await emitToolProgress(context as ToolExecutionContext, 'Naming conversation…');

    const { text: title } = await generateText({
      model: titleModel,
      temperature: 0,
      prompt: `Generate a short title (max 80 chars) summarizing this user message. Do not use quotes or colons. Return only the title.\n\n${userMessage.slice(0, 200)}`,
    });

    if (title) {
      await memoryStore.updateThread({
        id: threadId,
        title: title.trim(),
        metadata: thread?.metadata ?? {},
      });
    }

    await emitToolProgress(context as ToolExecutionContext, title?.trim() ?? '', 'done');

    return { title: title?.trim() ?? '' };
  },
});
