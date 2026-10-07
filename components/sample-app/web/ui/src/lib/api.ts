// The web server's API, as the pages use it. Every page refreshes itself, so
// it shows a failure, and the recovery, without a reload.

export const REFRESH_MS = 3000;
export const RETRIES = `This page retries every ${REFRESH_MS / 1000} seconds.`;

export interface Site {
  title: string;
  description: string;
  suggestions: string[];
}

export interface CatalogRecord {
  id: string;
  name: string;
  color: string;
  hex: string;
  shape: string;
  size: string;
}

export interface SearchResult {
  query: string;
  count: number;
  indexed: number;
  results: CatalogRecord[];
}

export interface Service {
  name: string;
  version: string | null;
  up: boolean;
}

export interface Status {
  services: Service[];
  registrations_today: number | null;
}

export interface Registration {
  confirmation: string;
  name: string;
  email: string;
  registered_at: string;
}

/** `status` is undefined when there was no answer at all. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(4000), ...init });
  } catch {
    throw new ApiError('No answer');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(data?.message ?? `HTTP ${response.status}`, response.status);
  return data as T;
}

export const clock = (date: Date | number = new Date()) => new Date(date).toLocaleTimeString([], { hour12: false });

/** A sentence for the banner, from an error thrown by getJson. */
export function reason(subject: string, error: unknown): string {
  const status = error instanceof ApiError ? error.status : undefined;
  const what = status ? `${subject} answered with an error (HTTP ${status})` : `${subject} did not answer`;
  return `${what}. Last attempt ${clock()}.`;
}
