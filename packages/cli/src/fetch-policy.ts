/** Fetch policy — ported from the hyperframes font pipeline:
 *  bounded attempts, per-attempt timeout, full-jitter backoff, shared budget.
 *  Infrastructure failures (network/5xx) throw; 4xx is a deterministic
 *  "not served" answer — callers decide fallback, not this layer. */
export interface FetchPolicy {
  attemptTimeoutMs: number;
  baseDelayMs: number;
  maxAttempts: number;
  maxElapsedMs: number;
}

export const DEFAULT_FETCH_POLICY: FetchPolicy = {
  attemptTimeoutMs: 8_000,
  baseDelayMs: 250,
  maxAttempts: 2,
  maxElapsedMs: 20_000,
};

export class FetchUnavailableError extends Error {
  constructor(
    public readonly url: string,
    cause: unknown,
  ) {
    super(`frogoe bundle: fetch unavailable: ${url}`);
    this.cause = cause;
    this.name = "FetchUnavailableError";
  }
}

export class FetchNotServedError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`frogoe bundle: not served (${status}): ${url}`);
    this.name = "FetchNotServedError";
  }
}

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const fetchWithPolicy = async (
  url: string,
  options?: {
    headers?: Record<string, string>;
    policy?: Partial<FetchPolicy>;
    fetchImpl?: FetchImpl;
  },
): Promise<string> => {
  const policy = { ...DEFAULT_FETCH_POLICY, ...options?.policy };
  const doFetch = options?.fetchImpl ?? fetch;
  const started = Date.now();

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    if (Date.now() - started > policy.maxElapsedMs) {
      throw new FetchUnavailableError(url, new Error("wall-clock budget exceeded"));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, policy.attemptTimeoutMs);
    try {
      const res = await doFetch(url, {
        headers: options?.headers,
        redirect: "follow",
        signal: controller.signal,
      });
      if (res.status >= 500) {
        throw new FetchUnavailableError(url, new Error(`upstream ${res.status}`));
      }
      if (res.status >= 400) {
        throw new FetchNotServedError(url, res.status);
      }
      return await res.text();
    } catch (error) {
      const retryable =
        error instanceof FetchUnavailableError || !(error instanceof FetchNotServedError);
      if (!retryable || attempt === policy.maxAttempts) {
        throw error;
      }
      await sleep(Math.random() * policy.baseDelayMs * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FetchUnavailableError(url, new Error("unreachable"));
};
