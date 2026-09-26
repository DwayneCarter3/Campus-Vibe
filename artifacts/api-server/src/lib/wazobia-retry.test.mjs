import assert from "node:assert/strict";
import test from "node:test";
import { fetchWazobiaWithRetry, WazobiaQuotaExceededError } from "./wazobia-retry.ts";

test("retries rate limits after 2, 4, and 8 seconds, then returns success", async () => {
  const delays = [];
  let calls = 0;
  const result = await fetchWazobiaWithRetry(
    async () => {
      calls++;
      return new Response(null, { status: calls < 4 ? 429 : 200 });
    },
    { sleep: async (ms) => { delays.push(ms); } },
  );
  assert.equal(result.status, 200);
  assert.equal(calls, 4);
  assert.deepEqual(delays, [2000, 4000, 8000]);
});

test("exhausted quota errors stop after three retries", async () => {
  let calls = 0;
  await assert.rejects(
    fetchWazobiaWithRetry(
      async () => {
        calls++;
        return Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 403 });
      },
      { sleep: async () => {} },
    ),
    WazobiaQuotaExceededError,
  );
  assert.equal(calls, 4);
});

test("other provider failures do not retry", async () => {
  let calls = 0;
  const result = await fetchWazobiaWithRetry(async () => {
    calls++;
    return Response.json({ error: { status: "UNAUTHENTICATED" } }, { status: 401 });
  });
  assert.equal(result.status, 401);
  assert.equal(calls, 1);
});