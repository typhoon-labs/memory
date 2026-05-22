import type { ToolExecutionContext } from '@mastra/core/tools';
import { createTool } from '@mastra/core/tools';
import type { LanguageModel } from '@typhoon/ai';
import { createTitleModel } from '@typhoon/ai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { emitThreadTitle, emitToolProgress } from './with-progress';

const titleModel = createTitleModel() as unknown as LanguageModel;

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

    const { output } = await generateText({
      model: titleModel,
      temperature: 0,
      output: Output.object({
        schema: z.object({
          title: z.string().describe('Short title (max 80 chars) summarizing the user message. No quotes or colons.'),
        }),
      }),
      prompt: `Generate a short title for this conversation based on the user's message.\n\n${userMessage.slice(0, 200)}`,
    });

    const title = (output?.title ?? '').slice(0, 80);

    if (title) {
      await memoryStore.updateThread({
        id: threadId,
        title,
        metadata: thread?.metadata ?? {},
      });
      await emitThreadTitle(context as ToolExecutionContext, title);
    }

    await emitToolProgress(context as ToolExecutionContext, title, 'done');

    return { title };
  },
});
