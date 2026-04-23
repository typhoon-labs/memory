# @typhoon/logger

Structured logging with environment-aware formatting. JSON output in production, human-readable in development.

## Exports

| Export | Description |
|--------|-------------|
| `createAppLogger()` | Named logger factory — `createAppLogger('ingestion')` |
| `TyphoonLogger` | Logger class extending Mastra's `MastraLogger` |

## Usage

```ts
import { createAppLogger } from '@typhoon/logger';

const logger = createAppLogger('my-service');
logger.info('Processing started', { documentId: 'doc-1' });
logger.error('Failed', { error: err.message });
```

**Development output:** `[INFO] my-service: Processing started { documentId: 'doc-1' }`

**Production output:** `{"ts":"...","level":"INFO","name":"my-service","msg":"Processing started","documentId":"doc-1"}`

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` (dev), `warn` (prod) | Minimum log level: `debug`, `info`, `warn`, `error` |
| `NODE_ENV` | — | Controls output format (production = JSON) |

## Dependencies

`@mastra/core`
