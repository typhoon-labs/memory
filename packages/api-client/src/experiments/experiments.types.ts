/** An experiment returned by the API. */
export interface Experiment {
  id: string;
  name: string;
  description: string | null;
  datasetId: string;
  scorerIds: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** Paginated list response for experiments. */
export interface ExperimentListResponse {
  experiments: Experiment[];
  total: number;
}

/** Payload for POST /v1/admin/experiments. */
export interface CreateExperimentInput {
  name: string;
  description?: string;
  datasetId: string;
  scorerIds: string[];
  [key: string]: unknown;
}

/** A single experiment result row. */
export interface ExperimentResult {
  id: string;
  experimentId: string;
  datasetItemId: string;
  input: string;
  output: string;
  expectedOutput: string | null;
  scores: Record<string, unknown>;
  createdAt: string;
}

/** Paginated experiment results response. */
export interface ExperimentResultsResponse {
  results: ExperimentResult[];
  total: number;
}

/** Comparison data between two experiments. */
export interface ExperimentComparison {
  a: Experiment;
  b: Experiment;
  scores: Record<string, { a: number; b: number; delta: number }>;
}
