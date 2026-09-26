const RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;

export class WazobiaQuotaExceededError extends Error {
  constructor() {
    super("WAZOBIA AI provider is rate limited after retries.");
    this.name = "WazobiaQuotaExceededError";
  }
}

async function isQuotaError(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  if (response.ok) return false;

  try {
    const body = await response.clone().json() as {
      error?: { status?: string; code?: string | number; type?: string; message?: string };
    };
    const error = body?.error;
    return Boolean(
      error && (
        error.code === 429 ||
        /RESOURCE_EXHAUSTED|QUOTA_EXCEEDED|rate_limit_exceeded|insufficient_quota/i.test(
          [error.status, error.type, error.code].join(" "),
        ) ||
        /quota|rate.limit|too many requests/i.test(error.message ?? "")
      ),
    );
  } catch {
    return false;
  }
}

/** Retry only provider quota/rate-limit responses, never auth or other failures. */
export async function fetchWazobiaWithRetry(
  request: () => Promise<Response>,
  options: {
    sleep?: (ms: number) => Promise<void>;
    onRetry?: (attempt: number, delayMs: number) => void;
  } = {},
): Promise<Response> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt++) {
    const response = await request();
    if (!(await isQuotaError(response))) return response;
    if (attempt === RETRY_DELAYS_MS.length) throw new WazobiaQuotaExceededError();
    const delay = RETRY_DELAYS_MS[attempt];
    options.onRetry?.(attempt + 1, delay);
    await sleep(delay);
  }
}