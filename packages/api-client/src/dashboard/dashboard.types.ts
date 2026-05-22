/** Common date-range params shared by all dashboard endpoints. */
export interface DashboardDateParams {
  dateFrom?: string;
  dateTo?: string;
  range?: string;
}

/** Params for the scores endpoint (adds optional scorerId). */
export interface DashboardScoresParams extends DashboardDateParams {
  scorerId?: string;
}

/** Params for thread/user endpoints (adds optional limit). */
export interface DashboardListParams extends DashboardDateParams {
  limit?: number;
}

/** A data point in a time-series response. */
export interface TimeSeriesPoint {
  date: string;
  value: number;
  [key: string]: unknown;
}

/** Response from GET /v1/admin/dashboard/scores. */
export interface DashboardScoresResponse {
  series: TimeSeriesPoint[];
  [key: string]: unknown;
}

/** A thread entry in the worst-threads list. */
export interface DashboardThread {
  threadId: string;
  title: string;
  avgScore: number;
  messageCount: number;
  createdAt: string;
}

/** Response from GET /v1/admin/dashboard/threads. */
export interface DashboardThreadsResponse {
  threads: DashboardThread[];
}

/** A user quality entry. */
export interface DashboardUser {
  userId: string;
  name: string;
  avgScore: number;
  threadCount: number;
}

/** Response from GET /v1/admin/dashboard/users. */
export interface DashboardUsersResponse {
  users: DashboardUser[];
}

/** Response from GET /v1/admin/dashboard/latency. */
export interface DashboardLatencyResponse {
  series: TimeSeriesPoint[];
  [key: string]: unknown;
}

/** Response from GET /v1/admin/dashboard/cost. */
export interface DashboardCostResponse {
  series: TimeSeriesPoint[];
  [key: string]: unknown;
}
