import test from "node:test";
import assert from "node:assert/strict";

import { buildVerifiedRoleIds } from "../verification/webCallback.js";

test("verification keeps unrelated roles and only removes the unverified role", () => {
  const result = buildVerifiedRoleIds(
    ["role-a", "unverified-role", "role-b"],
    ["role-c"],
    "verified-role",
    "unverified-role",
  );

  assert.deepEqual(result, ["role-a", "role-b", "role-c", "verified-role"]);
});

test("verification adds the verified role without dropping existing valid roles", () => {
  const result = buildVerifiedRoleIds(
    ["role-a", "role-b"],
    [],
    "verified-role",
    "unverified-role",
  );

  assert.deepEqual(result, ["role-a", "role-b", "verified-role"]);
});
