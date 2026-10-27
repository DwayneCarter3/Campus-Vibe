import { test } from "node:test";
import assert from "node:assert/strict";
import { NotificationPollTracker } from "../src/context/notification-polling.ts";

const notification = (id, isRead = false) => ({ id, isRead });

test("initial inbox is not replayed; new notifications alert exactly once", () => {
  const tracker = new NotificationPollTracker();
  assert.deepEqual(tracker.update("alice", [notification(1)]), []);
  assert.deepEqual(tracker.update("alice", [notification(2), notification(1)]), [notification(2)]);
  assert.deepEqual(tracker.update("alice", [notification(2), notification(1)]), []);
  assert.deepEqual(tracker.update("alice", [notification(2, true), notification(1, true)]), []);
});

test("failed snapshots do not discard subsequent alerts", () => {
  const tracker = new NotificationPollTracker();
  tracker.update("alice", []);
  assert.deepEqual(tracker.update("alice", undefined), []);
  assert.deepEqual(tracker.update("alice", [notification(3)]), [notification(3)]);
});

test("logout and identity switches reset the inbox without replaying alerts", () => {
  const tracker = new NotificationPollTracker();
  tracker.update("alice", [notification(1)]);
  assert.deepEqual(tracker.update(null, [notification(1)]), []);
  assert.deepEqual(tracker.update("bob", [notification(8)]), []);
  assert.deepEqual(tracker.update("bob", [notification(9), notification(8)]), [notification(9)]);
  assert.deepEqual(tracker.update("alice", [notification(9), notification(1)]), []);
});

test("already-read notifications never produce fresh alerts", () => {
  const tracker = new NotificationPollTracker();
  tracker.update("alice", []);
  assert.deepEqual(tracker.update("alice", [notification(4, true)]), []);
  assert.deepEqual(tracker.update("alice", [notification(4)]), []);
});

test("recent history remains deduplicated after many polls", () => {
  const tracker = new NotificationPollTracker();
  tracker.update("alice", []);
  for (let id = 1; id <= 400; id++) {
    assert.deepEqual(tracker.update("alice", [notification(id)]), [notification(id)]);
  }
  assert.deepEqual(tracker.update("alice", [notification(400), notification(399)]), []);
});
