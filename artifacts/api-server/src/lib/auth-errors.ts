type AuthStage = "handler" | "sign_in" | "password_recovery" | "verify_session" | "reconcile_profile" | "refresh_session";

export class AuthFlowError extends Error {
  stage: AuthStage;
  constructor(stage: AuthStage, cause: unknown) {
    super("Authentication flow failed.", { cause });
    this.name = "AuthFlowError";
    this.stage = stage;
  }
}

export async function authStep<T>(stage: AuthStage, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw error instanceof AuthFlowError ? error : new AuthFlowError(stage, error);
  }
}

function errorChain(error: unknown): Record<string, unknown>[] {
  const chain: Record<string, unknown>[] = [];
  let current = error;
  while (current && typeof current === "object" && chain.length < 4) {
    const entry = current as Record<string, unknown>;
    chain.push(entry);
    current = entry.cause;
  }
  return chain;
}

export function isAuthRateLimit(error: unknown): boolean {
  return errorChain(error).some((entry) => entry.status === 429 ||
    entry.code === "over_email_send_rate_limit" || entry.code === "over_request_rate_limit");
}

/** Never serialize messages, stacks, SQL, headers, tokens, or request bodies. */
export function authErrorDetails(error: unknown, stage: AuthStage = "handler") {
  const safeCode = (value: unknown) =>
    typeof value === "string" && /^[a-z0-9_]{1,64}$/i.test(value) ? value : undefined;
  return {
    stage: error instanceof AuthFlowError ? error.stage : stage,
    causes: errorChain(error).map((entry) => ({
      name: safeCode(entry.name),
      code: safeCode(entry.code),
      status: typeof entry.status === "number" && entry.status >= 100 && entry.status <= 599
        ? entry.status : undefined,
    })),
  };
}
