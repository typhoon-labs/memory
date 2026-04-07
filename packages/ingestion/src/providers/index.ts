import { S3Provider } from './s3.js';
import type { SourceProvider } from './types.js';

const providers: Record<string, SourceProvider> = {
  s3: new S3Provider(),
};

export function getProvider(sourceType: string): SourceProvider {
  const provider = providers[sourceType];
  if (!provider) throw new Error(`No provider for source type: ${sourceType}`);
  return provider;
}
