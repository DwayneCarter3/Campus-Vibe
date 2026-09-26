import assert from "node:assert/strict";
import test from "node:test";
import { publicPost, publicEmbeddedPost } from "./post-privacy.ts";

const original = {
  authorId: "user_secret",
  authorName: "Real Student",
  authorAvatarUrl: "/private-avatar.jpg",
  authorIsVerified: true,
  authorVerificationStatus: "Premium_Approved",
  isAnonymous: true,
  content: "Campus update",
};

const post = {
  ...original,
  authorFaculty: "Science",
  authorLevel: "400L",
  authorCampusLocation: "Ojo",
  authorCampusTitle: "Campus Legend",
  authorRole: "admin",
  originalPost: original,
};

test("anonymous posts hide identity even from their creator while preserving ownership", () => {
  for (const requesterId of [undefined, "another_user", "user_secret"]) {
    const safe = publicPost(post, requesterId);
    assert.equal(safe.authorId, "anonymous");
    assert.equal(safe.authorName, "Anonymous LASUite");
    assert.equal(safe.authorAvatarUrl, null);
    assert.equal(safe.authorLevel, "—");
    assert.equal(safe.authorIsVerified, false);
    assert.equal(safe.authorRole, "student");
    assert.equal(safe.originalPost.authorId, "anonymous");
    assert.equal(safe.originalPost.authorName, "Anonymous LASUite");
    assert.equal(safe.originalPost.authorAvatarUrl, null);
    assert.equal(safe.isOwnedByMe, requesterId === "user_secret");
    assert.ok(!JSON.stringify(safe).includes("user_secret"));
    assert.ok(!JSON.stringify(safe).includes("Real Student"));
    assert.ok(!JSON.stringify(safe).includes("/private-avatar.jpg"));
  }
});

test("regular posts preserve public identity without disclosing the requester", () => {
  const regular = { ...post, isAnonymous: false, originalPost: { ...original, isAnonymous: false } };
  const safe = publicPost(regular, "another_user");
  assert.equal(safe.authorId, "user_secret");
  assert.equal(safe.originalPost.authorId, "user_secret");
  assert.equal(safe.isOwnedByMe, false);
  assert.strictEqual(publicEmbeddedPost(regular.originalPost), regular.originalPost);
});