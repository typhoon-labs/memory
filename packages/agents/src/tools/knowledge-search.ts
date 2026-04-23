import type { Agent } from '@mastra/core/agent';
import type { ToolExecutionContext } from '@mastra/core/tools';
import { createTool } from '@mastra/core/tools';
import { createCitationModel } from '@typhoon/ai';
import type { PgVector } from '@typhoon/db/drivers/pg';
import { createAppLogger } from '@typhoon/logger';
import { generateText } from 'ai';
import { z } from 'zod';
import { emitToolProgress } from './with-progress';

const log = createAppLogger('knowledge-search');

const CITATION_SYSTEM = `You are a knowledge base assistant. Synthesize the search results into a clear, concise answer to the user's question.

Rules:
1. Cite using [Source: N.M] for a specific chunk within a multi-chunk document, where N is the document number and M is the chunk number.
   Example: "Employees receive 20 days of PTO per year [Source: 1.1]."
2. Cite using [Source: N] to reference an entire document (all its chunks), or for single-chunk documents.
   Example: "The handbook covers benefits comprehensively [Source: 2]."
3. Prefer document-level [Source: N] when the answer draws from the general document, and chunk-level [Source: N.M] when citing a specific passage.
4. When a claim draws from multiple sources, list them: [Source: 1.1, 2].
5. Every factual statement must have a citation.
6. If the search results don't contain relevant information, say so clearly. Never fabricate answers.
7. If the answer spans multiple documents, synthesize the information and cite all sources.
8. Be concise and direct — lead with the answer, then provide supporting detail.`;

/**
 * Two-phase knowledge search tool:
 *
 * Phase 1: Calls the knowledge agent with `toolChoice: 'auto'` to search
 * the knowledge base. The agent picks between hybrid and graph search tools.
 *
 * Phase 2: Takes the search results and makes a separate LLM call to
 * generate a response with inline `[Source: ...]` citations.
 *
 * Returns `{ text, _chunkSources }` — the text answer with inline citations
 * and ordered chunk sources for the citation extraction pipeline.
 */
export function createKnowledgeSearchTool(knowledgeAgent: Agent) {
  return createTool({
    id: 'searchKnowledge',
    description:
      'Search the knowledge base documents and return an answer with inline source citations. Use this for any factual question, product query, policy lookup, or troubleshooting.',
    inputSchema: z.object({
      prompt: z.string().describe('The user question to answer from the knowledge base'),
    }),
    outputSchema: z.object({
      text: z.string().describe('The answer with inline [Source: N] citations'),
      _chunkSources: z
        .array(
          z.object({
            index: z.number(),
            displayIndex: z.string(),
            chunkId: z.string(),
            title: z.string(),
            section: z.string(),
            text: z.string(),
            source: z.string(),
            syncTargetName: z.string(),
            documentId: z.string(),
            startIndex: z.number(),
            score: z.number(),
            searchTool: z.string(),
          }),
        )
        .optional()
        .describe('Ordered chunk sources matching [Source: N] numbering'),
    }),
    execute: async ({ prompt }, context) => {
      // Pass the Mastra instance to the knowledge agent so its search tools
      // can access the vector store (pgVector). Without this, vector queries
      // return empty results.
      if (context?.mastra) {
        // biome-ignore lint/suspicious/noExplicitAny: __registerMastra is internal but necessary for sub-agent tool context
        (knowledgeAgent as any).__registerMastra(context.mastra);
      }

      // Phase 1: Search the knowledge base
      await emitToolProgress(context as ToolExecutionContext, 'Searching the knowledge base…');

      let searchResult: Awaited<ReturnType<Agent['generate']>>;
      try {
        searchResult = await knowledgeAgent.generate(prompt, {
          toolChoice: 'auto',
          maxSteps: 7,
          modelSettings: { temperature: 0 },
        });
      } catch (error) {
        log.error('Knowledge agent failed', {
          error: error instanceof Error ? error.message : String(error),
          query: prompt,
        });
        return {
          text: 'I could not find relevant information in the knowledge base to answer this question.',
          _chunkSources: undefined,
        };
      }

      // Extract tool results (same structure as Mastra's subAgentToolResults)
      const subAgentToolResults: Array<{
        toolName: string;
        toolCallId: string;
        result: unknown;
        args: unknown;
      }> = [];
      for (const step of searchResult.steps ?? []) {
        for (const tr of step.toolResults ?? []) {
          const p = tr.payload;
          // Skip internal memory tools
          if (p.toolName === 'updateWorkingMemory') continue;
          subAgentToolResults.push({
            toolName: p.toolName,
            toolCallId: p.toolCallId,
            result: p.result,
            args: p.args,
          });
        }
      }

      // Collect source documents from search results, preserving chunk identity
      const sources: Array<Record<string, unknown>> = [];
      for (const tr of subAgentToolResults) {
        const result = tr.result as Record<string, unknown> | undefined;
        if (!result) continue;
        if (Array.isArray(result.sources)) {
          for (const src of result.sources) {
            if (typeof src === 'object' && src !== null) {
              const s = src as Record<string, unknown>;
              const meta = (s.metadata ?? s) as Record<string, unknown>;
              sources.push({
                title: meta.title ?? meta.documentTitle,
                section: meta.section,
                text: (meta.text ?? s.document ?? '') as string,
                source: meta.source,
                syncTargetId: meta.syncTargetId,
                documentId: meta.documentId,
                chunkId: s.id,
                startIndex: meta.startIndex,
                score: s.score,
                searchTool: tr.toolName,
              });
            }
          }
        }
      }

      log.debug('sources collected', {
        query: prompt,
        toolsUsed: [...new Set(sources.map((s) => s.searchTool))],
        rawCount: sources.length,
      });

      // Dedup sources by chunkId, keeping the highest-scoring entry
      const dedupMap = new Map<string, Record<string, unknown>>();
      for (const s of sources) {
        const id = s.chunkId as string;
        if (!id) continue;
        const existing = dedupMap.get(id);
        if (!existing || (s.score as number) > (existing.score as number)) {
          dedupMap.set(id, s);
        }
      }
      const uniqueSources = [...dedupMap.values()];

      // Filter low-quality results and cap count
      const filtered = uniqueSources
        .filter((s) => (s.score as number) >= 0.25)
        .sort((a, b) => (b.score as number) - (a.score as number))
        .slice(0, 10);

      log.debug('filtered', {
        dedupCount: uniqueSources.length,
        belowThreshold: uniqueSources.filter((s) => (s.score as number) < 0.25).length,
        finalCount: filtered.length,
        scores: filtered.map((s) => s.score),
        documents: [...new Set(filtered.map((s) => s.source))],
      });

      if (filtered.length === 0) {
        log.debug('no results after filtering');
        return {
          text: 'I could not find relevant information in the knowledge base to answer this question.',
          _chunkSources: undefined,
        };
      }

      // Group sources by document for hierarchical citation indices
      const docGroups = new Map<string, Array<Record<string, unknown>>>();
      for (const s of filtered) {
        const key = (s.documentId as string) ?? (s.title as string);
        const group = docGroups.get(key) ?? [];
        group.push(s);
        docGroups.set(key, group);
      }

      // Assign hierarchical display indices: [1.1], [1.2] for multi-chunk docs, [2] for solo
      let docNum = 0;
      const indexedSources: Array<Record<string, unknown> & { displayIndex: string }> = [];
      for (const [, group] of docGroups) {
        docNum++;
        if (group.length === 1) {
          indexedSources.push({ ...group[0], displayIndex: String(docNum) });
        } else {
          for (let i = 0; i < group.length; i++) {
            indexedSources.push({ ...group[i], displayIndex: `${docNum}.${i + 1}` });
          }
        }
      }

      // Phase 2: Generate cited response
      await emitToolProgress(context as ToolExecutionContext, 'Composing answer with citations…');

      // Build source summary grouped by document
      const summaryParts: string[] = [];
      docNum = 0;
      for (const [, group] of docGroups) {
        docNum++;
        const docTitle = (group[0].title as string) ?? 'Unknown';
        if (group.length === 1) {
          const s = group[0];
          summaryParts.push(
            `Document ${docNum}: ${docTitle}\n  [${docNum}]${s.section ? ` Section: ${s.section}` : ''}\n  Content: ${(s.text as string).slice(0, 500)}`,
          );
        } else {
          const chunks = group
            .map(
              (s, i) =>
                `  [${docNum}.${i + 1}]${s.section ? ` Section: ${s.section}` : ''}\n  Content: ${(s.text as string).slice(0, 500)}`,
            )
            .join('\n\n');
          summaryParts.push(`Document ${docNum}: ${docTitle}\n${chunks}`);
        }
      }

      const { text } = await generateText({
        model: createCitationModel(),
        temperature: 0,
        system: CITATION_SYSTEM,
        prompt: `User question: ${prompt}\n\nSearch results:\n${summaryParts.join('\n\n')}`,
      });

      // Parse which references the LLM actually cited
      const citedRefs = new Set<string>();
      const refPattern = /\[Source:\s*([\d.]+(?:\s*,\s*[\d.]+)*)\s*\]/g;
      for (const refMatch of text.matchAll(refPattern)) {
        for (const ref of refMatch[1].split(/\s*,\s*/)) {
          citedRefs.add(ref.trim());
        }
      }

      // Reassign sequential displayIndex only to cited chunks
      const oldToNew = new Map<string, string>();
      const citedByDoc = new Map<string, string[]>();
      for (const ref of citedRefs) {
        const docPrefix = ref.includes('.') ? ref.split('.')[0] : ref;
        const group = citedByDoc.get(docPrefix) ?? [];
        group.push(ref);
        citedByDoc.set(docPrefix, group);
      }

      let newDocNum = 0;
      for (const [, refs] of citedByDoc) {
        newDocNum++;
        refs.sort((a, b) => {
          const aNum = a.includes('.') ? Number(a.split('.')[1]) : 0;
          const bNum = b.includes('.') ? Number(b.split('.')[1]) : 0;
          return aNum - bNum;
        });
        if (refs.length === 1) {
          oldToNew.set(refs[0], String(newDocNum));
        } else {
          for (let i = 0; i < refs.length; i++) {
            oldToNew.set(refs[i], `${newDocNum}.${i + 1}`);
          }
        }
      }

      // Rewrite [Source: X] markers in the text with new sequential indices
      const rewrittenText = text.replace(refPattern, (_match, captured: string) => {
        const refs = (captured as string).split(/\s*,\s*/);
        const mapped = refs.map((r: string) => oldToNew.get(r.trim()) ?? r.trim());
        return `[Source: ${mapped.join(', ')}]`;
      });

      // Resolve sync target names from IDs so citations can show the source location
      let syncTargetNames = new Map<string, string>();
      const uniqueTargetIds = [...new Set(indexedSources.map((s) => s.syncTargetId).filter(Boolean))] as string[];
      if (uniqueTargetIds.length > 0 && context?.mastra) {
        const vectorStore = context.mastra.getVector('pgVector') as PgVector | undefined;
        if (vectorStore) {
          syncTargetNames = await vectorStore.getSyncTargetNames(uniqueTargetIds);
        }
      }

      // Only include cited chunks in _chunkSources
      const citedSources = indexedSources.filter((s) => oldToNew.has(s.displayIndex));
      const _chunkSources = citedSources.map((s, i) => ({
        index: i + 1,
        displayIndex: oldToNew.get(s.displayIndex) ?? s.displayIndex,
        chunkId: String(s.chunkId ?? ''),
        title: String(s.title ?? ''),
        section: String(s.section ?? ''),
        text: String(s.text ?? '').slice(0, 200),
        source: String(s.source ?? ''),
        syncTargetName: syncTargetNames.get(String(s.syncTargetId ?? '')) ?? '',
        documentId: String(s.documentId ?? ''),
        startIndex: Number(s.startIndex ?? 0),
        score: Number(s.score ?? 0),
        searchTool: String(s.searchTool ?? ''),
      }));

      log.debug('citation reindex', {
        citedCount: citedRefs.size,
        totalChunks: indexedSources.length,
        mapping: Object.fromEntries(oldToNew),
      });

      // Resolve graph tool fake IDs (numeric indices like "5", "13") to real
      // vector store chunk IDs so hydration can look them up later.
      // Done AFTER citation generation to avoid changing dedup/ordering behavior.
      const realIdLookup = new Map<string, string>();
      for (const s of sources) {
        const id = s.chunkId as string;
        if (id && !/^\d+$/.test(id) && s.documentId && s.startIndex != null) {
          realIdLookup.set(`${s.documentId}::${s.startIndex}`, id);
        }
      }
      for (const cs of _chunkSources) {
        if (typeof cs.chunkId === 'string' && /^\d+$/.test(cs.chunkId as string)) {
          const key = `${cs.documentId}::${cs.startIndex}`;
          const realId = realIdLookup.get(key);
          if (realId) cs.chunkId = realId;
        }
      }
      // Query vector store for any still-unresolved graph IDs
      const unresolved = _chunkSources.filter(
        (cs) => typeof cs.chunkId === 'string' && /^\d+$/.test(cs.chunkId as string) && cs.documentId,
      );
      if (unresolved.length > 0 && context?.mastra) {
        const vs = context.mastra.getVector('pgVector') as PgVector | undefined;
        if (vs) {
          for (const cs of unresolved) {
            const realId = await vs.getChunkIdByDocumentAndIndex('knowledge_base', cs.documentId, cs.startIndex);
            if (realId) cs.chunkId = realId;
          }
        }
      }

      return { text: rewrittenText, _chunkSources };
    },
  });
}
