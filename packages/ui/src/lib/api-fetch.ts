/** Typed error for non-OK HTTP responses. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message?: string,
  ) {
    super(message ?? `${status} ${statusText}`);
    this.name = 'ApiError';
  }
}

/**
 * Fetch wrapper that throws {@link ApiError} on non-OK responses.
 * Includes `credentials: 'include'` by default so session cookies are sent.
 */
export async function apiFetch<T = unknown>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { credentials: 'include', ...init });
  if (!response.ok) {
    let message: string | undefined;
    try {
      const body = await response.json();
      if (typeof body.error === 'string') message = body.error;
      else if (typeof body.message === 'string') message = body.message;
    } catch {
      // Response body isn't JSON — fall through to default message.
    }
    throw new ApiError(response.status, response.statusText, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
