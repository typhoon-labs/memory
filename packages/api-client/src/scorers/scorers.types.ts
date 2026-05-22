/** A scorer definition returned by the API. */
export interface Scorer {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  activeVersionId: string | null;
  activeVersion?: ScorerVersion;
  createdAt: string;
  updatedAt: string;
}

/** A scorer version. */
export interface ScorerVersion {
  id: string;
  scorerId: string;
  version: number;
  config: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
}

/** Available model for scorer selection. */
export interface ScorerModel {
  id: string;
  name: string;
  provider: string;
}

/** Paginated list response for scorers. */
export interface ScorerListResponse {
  scorers: Scorer[];
  total: number;
}

/** Paginated list response for scorer versions. */
export interface ScorerVersionListResponse {
  versions: ScorerVersion[];
  total: number;
}

/** Payload for POST /v1/admin/scorers (create scorer + initial version). */
export interface CreateScorerInput {
  name: string;
  description?: string;
  type: string;
  config: Record<string, unknown>;
}

/** Payload for PATCH /v1/admin/scorers/:id. */
export interface UpdateScorerInput {
  name?: string;
  description?: string;
  status?: string;
}

/** Payload for POST /v1/admin/scorers/:id/versions. */
export interface CreateScorerVersionInput {
  config: Record<string, unknown>;
}

/** Payload for POST /v1/admin/scorers/:id/publish. */
export interface PublishVersionInput {
  versionId?: string;
}

/** Payload for POST /v1/admin/scorers/:id/preview. */
export interface PreviewScoreInput {
  input: string;
  output: string;
  expectedOutput?: string;
  versionId?: string;
}

/** Result of a scorer preview. */
export interface PreviewScoreResult {
  score: number;
  reasoning: string;
  details?: Record<string, unknown>;
}
