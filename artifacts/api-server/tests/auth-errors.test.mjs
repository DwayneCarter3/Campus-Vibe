import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthFlowError, authStep, authErrorDetails, isAuthRateLimit } from "../src/lib/auth-errors.ts";

test("recognizes provider rate-limit codes, HTTP status, and wrapped errors", () => {
  assert.equal(isAuthRateLimit({ code: "over_email_send_rate_limit", status: 400 }), true);
  assert.equal(isAuthRateLimit({ status: 429 }), true);
  assert.equal(isAuthRateLimit(new AuthFlowError("refresh_session", { code: "over_request_rate_limit" })), true);
  assert.equal(isAuthRateLimit({ status: 503, code: "unexpected_failure" }), false);
  assert.equal(isAuthRateLimit({ status: 400, code: "invalid_credentials" }), false);
});

test("retains the failing stage and nested provider/network codes", async () => {
  await assert.rejects(authStep("verify_session", async () => {
    throw { name: "AuthRetryableFetchError", status: 503, cause: { code: "ENOTFOUND" } };
  }), (error) => {
    assert.deepEqual(authErrorDetails(error), {
      stage: "verify_session",
      causes: [
        { name: "AuthFlowError", code: undefined, status: undefined },
        { name: "AuthRetryableFetchError", code: undefined, status: 503 },
        { name: undefined, code: "ENOTFOUND", status: undefined },
      ],
    });
    return true;
  });
});

test("never logs raw errors, SQL, credentials, or unsafe codes", () => {
  const diagnostics = authErrorDetails({
    name: "Error",
    code: "23505",
    message: "private-person@example.test",
    query: "SQL containing private data",
    password: "private-password",
    access_token: "private-token",
    stack: "private stack",
    cause: { code: "private-person@example.test", status: 123456 },
  }, "reconcile_profile");
  assert.equal(diagnostics.causes[0].code, "23505");
  assert.equal(diagnostics.causes[1].code, undefined);
  assert.equal(diagnostics.causes[1].status, undefined);
  assert.doesNotMatch(JSON.stringify(diagnostics), /private|SQL|password|access_token|query|stack/);
});

test("bounds circular error causes", () => {
  const error = { code: "unexpected_failure" };
  error.cause = error;
  assert.equal(authErrorDetails(error).causes.length, 4);
  assert.equal(isAuthRateLimit(error), false);
});

test("does not replace a more specific authentication stage", async () => {
  await assert.rejects(authStep("sign_in", async () => {
    throw new AuthFlowError("reconcile_profile", { code: "profile_missing" });
  }), (error) => authErrorDetails(error).stage === "reconcile_profile");
});
