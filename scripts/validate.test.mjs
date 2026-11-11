import test from "node:test";
import assert from "node:assert/strict";
import { validateCatalog } from "./validate.mjs";

const sample = () => ({ id: "community-001", code: "MUSE42", status: "unverified", addedAt: "2026-11-11", submittedBy: "contributor-1" });

test("empty catalog is valid before first contribution", () => {
  assert.deepEqual(validateCatalog([]), []);
});
test("valid community entry is accepted", () => {
  assert.deepEqual(validateCatalog([sample()]), []);
});
test("duplicate codes and IDs are rejected", () => {
  const errors = validateCatalog([sample(), { ...sample() }]);
  assert.ok(errors.some(e => e.includes("duplicate id")));
  assert.ok(errors.some(e => e.includes("duplicate code")));
});
test("unverified claims cannot be marked as officially verified", () => {
  assert.ok(validateCatalog([{ ...sample(), status: "verified-by-muse" }]).some(e => e.includes("invalid community status")));
});
test("invalid dates, unsafe URLs and non-objects are rejected", () => {
  assert.ok(validateCatalog([{ ...sample(), addedAt: "2026-02-30", sourceUrl: "javascript:alert(1)" }]).length >= 2);
  assert.ok(validateCatalog([null]).length > 0);
});
