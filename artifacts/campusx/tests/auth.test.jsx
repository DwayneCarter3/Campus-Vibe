import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, expect, test, vi } from "vitest";
import { AuthProvider, useAuth } from "../src/lib/auth";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let tree, state;
const user = { id: "legacy-account", authId: "test-auth-id", role: "CEO", fullName: "Test" };
function Probe() { state = useAuth(); return null; }
async function mount() {
  await act(async () => { tree = create(<AuthProvider><Probe /></AuthProvider>); });
}
function response(status, data) { return { ok: status < 400, status, json: async () => data }; }
function requests(...values) {
  const mock = vi.fn();
  for (const value of values) mock.mockResolvedValueOnce(value);
  vi.stubGlobal("fetch", mock);
  return mock;
}
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  tree = null;
  vi.unstubAllGlobals();
});

test("reload restores user using cookies, without browser token storage", async () => {
  const storage = { getItem: vi.fn(() => { throw Error("Do not read token storage"); }),
    setItem: vi.fn(() => { throw Error("Do not write token storage"); }) };
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  const fetch = requests(response(200, { user, needsOnboarding: false }));
  await mount();
  expect(state.isLoaded).toBe(true);
  expect(state.user).toEqual(user);
  expect(fetch.mock.calls[0][0]).toBe("/api/auth/me");
  expect(fetch.mock.calls[0][1].credentials).toBe("include");
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
});
test("expired access session refreshes from HTTP-only cookies on reload", async () => {
  const fetch = requests(response(401, { error: "Unauthorized" }), response(200, { user, needsOnboarding: true }));
  await mount();
  expect(state.isSignedIn).toBe(true);
  expect(state.user.id).toBe("legacy-account");
  expect(state.needsOnboarding).toBe(true);
  expect(fetch.mock.calls[1]).toEqual(["/api/auth/refresh", {
    method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}",
  }]);
});
test("expired refresh is signed out, not a startup error", async () => {
  requests(response(401, {}), response(401, {}));
  await mount();
  expect(state).toMatchObject({ isLoaded: true, isSignedIn: false, user: null, bootError: null });
});
test("provider outage shows retry error instead of silently erasing a session", async () => {
  const fetch = requests(response(200, { user, needsOnboarding: false }), response(503, {}));
  await mount();
  await act(async () => { await state.refresh(); });
  expect(state.user).toEqual(user);
  expect(state.bootError).toContain("error 503");
  expect(fetch).toHaveBeenCalledTimes(2); // No refresh loop on an outage.
});
test("duplicate signup preserves exact server text and never signs the user in", async () => {
  requests(response(401, {}), response(401, {}), response(400, { error: "Account already exists. Please log in." }));
  await mount();
  await expect(state.signUp("existing@example.test", "SafeTestPassword9", "Test"))
    .rejects.toMatchObject({ status: 400, message: "Account already exists. Please log in." });
  expect(state.isSignedIn).toBe(false);
});
test("sign-in and logout update identity listeners and send credentialed requests", async () => {
  const fetch = requests(response(401, {}), response(401, {}),
    response(200, { user, needsOnboarding: false }), response(200, { ok: true }));
  await mount();
  const listener = vi.fn();
  const unsubscribe = state.addListener(listener);
  await act(async () => { await state.signIn("test@example.test", "SafeTestPassword9"); });
  expect(state.user).toEqual(user);
  expect(listener).toHaveBeenLastCalledWith({ user });
  await act(async () => { await state.signOut(); });
  expect(state.isSignedIn).toBe(false);
  expect(listener).toHaveBeenLastCalledWith({ user: null });
  expect(fetch.mock.calls[3][0]).toBe("/api/auth/logout");
  expect(fetch.mock.calls[3][1].credentials).toBe("include");
  unsubscribe();
});
