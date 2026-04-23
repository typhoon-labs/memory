# @typhoon/ai

Centralized AI model factory. Creates task-specific LLM and embedding model instances via an OpenAI-compatible provider (supports Bedrock, Bifrost, or any compatible gateway).

## Exports

| Export | Description |
|--------|-------------|
| `createChatModel()` | Primary LLM for agent conversations |
| `createTitleModel()` | Lightweight model for title/metadata extraction |
| `createEmbeddingModel()` | Embedding generation for vector search |
| `createRerankerModel()` | Reranking retrieval results |
| `createExtractionModel()` | Metadata extraction during ingestion |
| `createGuardrailModel()` | Guardrail/moderation checks |
| `EMBEDDING_DIMENSION` | Vector dimension constant (default: 1024) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_BASE_URL` | — | OpenAI-compatible API endpoint |
| `LLM_API_KEY` | — | API key for LLM gateway |
| `LLM_CHAT_MODEL` | `anthropic.claude-sonnet-4-6` | Primary chat model |
| `LLM_TITLE_MODEL` | Falls back to chat model | Title generation model |
| `LLM_EXTRACTION_MODEL` | Falls back to chat model | Metadata extraction model |
| `LLM_GUARDRAIL_MODEL` | Falls back to chat model | Guardrail model |
| `LLM_RERANKER_MODEL` | Falls back to chat model | Reranker model |
| `LLM_SCORING_MODEL` | Falls back to chat model | RAG scoring / evaluation model |
| `EMBEDDING_BASE_URL` | Falls back to `LLM_BASE_URL` | Embedding API endpoint |
| `EMBEDDING_API_KEY` | Falls back to `LLM_API_KEY` | Embedding API key |
| `EMBEDDING_MODEL` | `amazon.titan-embed-text-v2:0` | Embedding model |
| `EMBEDDING_DIMENSION` | `1024` | Vector dimension |

## Dependencies

`@ai-sdk/openai-compatible`, `ai`
