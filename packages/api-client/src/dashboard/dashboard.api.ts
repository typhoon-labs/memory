import { apiFetch } from '../client';
import type {
  DashboardCostResponse,
  DashboardDateParams,
  DashboardLatencyResponse,
  DashboardListParams,
  DashboardScoresParams,
  DashboardScoresResponse,
  DashboardThreadsResponse,
  DashboardUsersResponse,
} from './dashboard.types';

/** Build query string from dashboard params. */
function toSearchParams(params?: DashboardDateParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Low-level dashboard API calls. */
export const dashboardApi = {
  /** Score time-series data. */
  getScores: (params?: DashboardScoresParams) =>
    apiFetch<DashboardScoresResponse>(`/api/v1/admin/dashboard/scores${toSearchParams(params)}`),

  /** Worst-performing threads. */
  getThreads: (params?: DashboardListParams) =>
    apiFetch<DashboardThreadsResponse>(`/api/v1/admin/dashboard/threads${toSearchParams(params)}`),

  /** User quality breakdown. */
  getUsers: (params?: DashboardListParams) =>
    apiFetch<DashboardUsersResponse>(`/api/v1/admin/dashboard/users${toSearchParams(params)}`),

  /** Latency time-series data. */
  getLatency: (params?: DashboardScoresParams) =>
    apiFetch<DashboardLatencyResponse>(`/api/v1/admin/dashboard/latency${toSearchParams(params)}`),

  /** Cost time-series data. */
  getCost: (params?: DashboardScoresParams) =>
    apiFetch<DashboardCostResponse>(`/api/v1/admin/dashboard/cost${toSearchParams(params)}`),
};
