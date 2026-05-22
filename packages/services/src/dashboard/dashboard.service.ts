import type {
  CostRow,
  DashboardRepo,
  DateRange,
  LatencyRow,
  ScoreSeriesRow,
  UserQualityRow,
  WorstThreadRow,
} from '@typhoon/db/repos';
import { getBucketInterval, normalizeDateRange } from '@typhoon/db/repos';

import type { Result } from '../types';

export interface DashboardServiceDeps {
  dashboardRepo: DashboardRepo;
}

export interface DateRangeParams {
  dateFrom: string;
  dateTo: string;
  range?: string;
}

export interface ScoreSeriesResult {
  series: Array<{
    date: string;
    scorerId: string;
    avgScore: number;
    count: number;
    failCount: number;
  }>;
  buckets: string[];
}

export interface WorstThreadsResult {
  threads: Array<{
    threadId: string;
    title: string;
    resourceId: string;
    responseAvg: number | null;
    retrievalAvg: number | null;
    scoreCount: number;
    createdAt: string;
  }>;
}

export interface UserQualityResult {
  users: Array<{
    resourceId: string;
    email: string | null;
    responseAvg: number | null;
    retrievalAvg: number | null;
    scoreCount: number;
    threadCount: number;
  }>;
}

export interface LatencySeriesResult {
  series: Array<{
    date: string;
    p50: number | null;
    p95: number | null;
    p99: number | null;
    count: number;
  }>;
}

export interface CostSeriesResult {
  series: Array<{
    date: string;
    promptTokens: number;
    completionTokens: number;
    callCount: number;
  }>;
}

export class DashboardService {
  private dashboardRepo: DashboardRepo;

  constructor(deps: DashboardServiceDeps) {
    this.dashboardRepo = deps.dashboardRepo;
  }

  /** Get score trends over time. */
  async getScoreSeries(params: DateRangeParams & { scorerId?: string }): Promise<Result<ScoreSeriesResult>> {
    const { dateFrom, dateTo } = params;
    const range: DateRange = normalizeDateRange(params.range);
    const bucket = getBucketInterval(range);

    const [buckets, rows] = await Promise.all([
      this.dashboardRepo.queryBuckets(dateFrom, dateTo, bucket),
      this.dashboardRepo.getScoreSeries(dateFrom, dateTo, bucket, params.scorerId),
    ]);

    return {
      data: {
        series: rows.map((r: ScoreSeriesRow) => ({
          date: String(r.date),
          scorerId: r.scorer_id,
          avgScore: r.avg_score,
          count: r.count,
          failCount: r.fail_count,
        })),
        buckets,
      },
    };
  }

  /** Get worst-scoring threads. */
  async getWorstThreads(params: DateRangeParams & { limit: number }): Promise<Result<WorstThreadsResult>> {
    const rows = await this.dashboardRepo.getWorstThreads(params.dateFrom, params.dateTo, params.limit);

    return {
      data: {
        threads: rows.map((r: WorstThreadRow) => ({
          threadId: r.thread_id,
          title: r.title,
          resourceId: r.resource_id,
          responseAvg: r.response_avg,
          retrievalAvg: r.retrieval_avg,
          scoreCount: r.score_count,
          createdAt: r.thread_created_at,
        })),
      },
    };
  }

  /** Get per-user quality aggregates. */
  async getUserQuality(params: DateRangeParams & { limit: number }): Promise<Result<UserQualityResult>> {
    const rows = await this.dashboardRepo.getUserQuality(params.dateFrom, params.dateTo, params.limit);

    return {
      data: {
        users: rows.map((r: UserQualityRow) => ({
          resourceId: r.resource_id,
          email: r.email,
          responseAvg: r.response_avg,
          retrievalAvg: r.retrieval_avg,
          scoreCount: r.score_count,
          threadCount: r.thread_count,
        })),
      },
    };
  }

  /** Get response latency percentiles. */
  async getLatencySeries(params: DateRangeParams): Promise<Result<LatencySeriesResult>> {
    const { dateFrom, dateTo } = params;
    const range: DateRange = normalizeDateRange(params.range);
    const bucket = getBucketInterval(range);

    const [buckets, rows] = await Promise.all([
      this.dashboardRepo.queryBuckets(dateFrom, dateTo, bucket),
      this.dashboardRepo.getLatencySeries(dateFrom, dateTo, bucket),
    ]);

    const dataMap = new Map(rows.map((r: LatencyRow) => [String(r.date), r]));
    return {
      data: {
        series: buckets.map((date) => {
          const d = dataMap.get(date);
          return d
            ? { date, p50: Math.round(d.p50), p95: Math.round(d.p95), p99: Math.round(d.p99), count: d.count }
            : { date, p50: null, p95: null, p99: null, count: 0 };
        }),
      },
    };
  }

  /** Get token usage over time. */
  async getCostSeries(params: DateRangeParams): Promise<Result<CostSeriesResult>> {
    const { dateFrom, dateTo } = params;
    const range: DateRange = normalizeDateRange(params.range);
    const bucket = getBucketInterval(range);

    const [buckets, rows] = await Promise.all([
      this.dashboardRepo.queryBuckets(dateFrom, dateTo, bucket),
      this.dashboardRepo.getCostSeries(dateFrom, dateTo, bucket),
    ]);

    const dataMap = new Map(rows.map((r: CostRow) => [String(r.date), r]));
    return {
      data: {
        series: buckets.map((date) => {
          const d = dataMap.get(date);
          return d
            ? { date, promptTokens: d.prompt_tokens, completionTokens: d.completion_tokens, callCount: d.call_count }
            : { date, promptTokens: 0, completionTokens: 0, callCount: 0 };
        }),
      },
    };
  }
}
