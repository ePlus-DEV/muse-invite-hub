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

test("source-linked, dated self-reported usage is accepted", () => {
  const entry = {
    ...sample(), sourceUrl: "https://github.com/example/repo/issues/1",
    reportedUses: 1, reportedCapacity: 30, usageReportedAt: "2026-11-11"
  };
  assert.deepEqual(validateCatalog([entry]), []);
});
test("undated, invalid, or exaggerated usage claims are rejected", () => {
  assert.ok(validateCatalog([{ ...sample(), reportedUses: 1, reportedCapacity: 30 }]).some(e => e.includes("usageReportedAt")));
  assert.ok(validateCatalog([{ ...sample(), reportedUses: 31, reportedCapacity: 30, usageReportedAt: "2026-11-11" }]).some(e => e.includes("cannot exceed")));
  assert.ok(validateCatalog([{ ...sample(), reportedUses: -1, reportedCapacity: 30, usageReportedAt: "2026-11-11" }]).some(e => e.includes("non-negative")));
});
