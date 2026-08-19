// utils/network.ts
// Robust networking utilities for React Native / Hermes runtime.
// Hermes does not support AbortSignal.timeout(), so fetchWithTimeout provides
// unified, leak-free AbortController + timer management with explicit TimeoutError.

export class TimeoutError extends Error {
  readonly timeoutMs: number;
  readonly url: string;

  constructor(url: string, timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    this.url = url;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;
}

export const DEFAULT_FETCH_TIMEOUT_MS = 15000;

/**
 * Perform a fetch request with an enforced timeout compatible with React Native / Hermes.
 * Safely cleans up timers and attaches internal AbortController. If an external signal is passed,
 * aborting either the external signal or hitting the timeout will cancel the request.
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal: externalSignal, ...fetchOptions } = options;
  const controller = new AbortController();
  let isTimeout = false;

  const timeoutId = setTimeout(() => {
    isTimeout = true;
    controller.abort();
  }, timeoutMs);

  // If caller provided an external AbortSignal, abort internal controller if external fires
  const onExternalAbort = () => {
    controller.abort();
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (isTimeout) {
      throw new TimeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
