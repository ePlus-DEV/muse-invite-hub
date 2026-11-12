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
    ...sample(), sourceUrl: "https://github.com/ePlus-DEV/muse-invite-hub/issues/14",
    reportedUses: 1, reportedCapacity: 30, usageReportedAt: "2026-11-11"
  };
  assert.deepEqual(validateCatalog([entry]), []);
});
test("undated, invalid, or exaggerated usage claims are rejected", () => {
  assert.ok(validateCatalog([{ ...sample(), reportedUses: 1, reportedCapacity: 30 }]).some(e => e.includes("usageReportedAt")));
  assert.ok(validateCatalog([{ ...sample(), reportedUses: 31, reportedCapacity: 30, usageReportedAt: "2026-11-11" }]).some(e => e.includes("cannot exceed")));
  assert.ok(validateCatalog([{ ...sample(), reportedUses: -1, reportedCapacity: 30, usageReportedAt: "2026-11-11" }]).some(e => e.includes("non-negative")));
});

test("remaining-only reports with a date and GitHub numeric owner ID are supported", () => {
  assert.deepEqual(validateCatalog([{...sample(),reportedRemaining:17,usageReportedAt:"2026-11-11",submittedById:316039127}]),[]);
  assert.ok(validateCatalog([{...sample(),reportedRemaining:17}]).some(e=>e.includes("usageReportedAt")));
  assert.ok(validateCatalog([{...sample(),reportedRemaining:-1,usageReportedAt:"2026-11-11"}]).some(e=>e.includes("reportedRemaining")));
  assert.ok(validateCatalog([{...sample(),reportedRemaining:18,reportedCapacity:30,reportedUses:12,usageReportedAt:"2026-11-11"}]).some(e=>e.includes("either full")));
  assert.ok(validateCatalog([{...sample(),submittedById:0}]).some(e=>e.includes("submittedById")));
});
test("one unverified featured owner-submitted code is valid", () => {
  assert.deepEqual(validateCatalog([{ ...sample(), featured: true }]), []);
});
test("only one featured code is allowed", () => {
  const errors = validateCatalog([
    { ...sample(), featured: true },
    { ...sample(), id: "community-002", code: "MUSE43", featured: true }
  ]);
  assert.ok(errors.some(e => e.includes("Only one featured")));
});
test("featured must be boolean and cannot be reported not working", () => {
  assert.ok(validateCatalog([{ ...sample(), featured: "true" }]).some(e => e.includes("must be a boolean")));
  assert.ok(validateCatalog([{ ...sample(), featured: true, status: "reported-not-working" }]).some(e => e.includes("do not feature")));
});

test("featured code can have confirmed owner without claiming Muse redemption", () => {
  assert.deepEqual(validateCatalog([{ ...sample(), submittedBy: "hoangsvit", featured: true, ownerConfirmed: true, status: "unverified" }]), []);
});
test("non-owner or nonfeatured codes cannot claim owner confirmation", () => {
  assert.ok(validateCatalog([{ ...sample(), featured: true, ownerConfirmed: true }]).some(e => e.includes("only the featured")));
  assert.ok(validateCatalog([{ ...sample(), submittedBy: "hoangsvit", ownerConfirmed: true }]).some(e => e.includes("only the featured")));
  assert.ok(validateCatalog([{ ...sample(), ownerConfirmed: "true" }]).some(e => e.includes("must be a boolean")));
});

test("full allocation is allowed and means zero reported remaining", () => {
  const entry = { ...sample(), reportedUses: 30, reportedCapacity: 30, usageReportedAt: "2026-11-11" };
  assert.deepEqual(validateCatalog([entry]), []);
  assert.equal(entry.reportedCapacity - entry.reportedUses, 0);
});
test("reported usage must never be greater than capacity", () => {
  assert.ok(validateCatalog([{ ...sample(), reportedUses: 31, reportedCapacity: 30, usageReportedAt: "2026-11-11" }]).some(e => e.includes("cannot exceed")));
});

test("external repository links are not accepted in public catalog references", () => {
  const unrelated = "https://github.com/" + "someone-else" + "/" + "another-project" + "/issues/1";
  const error = validateCatalog([{ ...sample(), sourceUrl: unrelated }]);
  assert.ok(error.some(x => x.includes("unrelated GitHub repository")));
  assert.deepEqual(validateCatalog([{ ...sample(), sourceUrl: "https://muse.ai/join" }]), []);
});

test("Threads sourceUrl works with trusted main preview schema", () => {
  const entry = { id: "threads-sample", code: "18I70N", status: "unverified",
    addedAt: "2026-11-12", sourceUrl: "https://www.threads.com/@baijiling2" };
  assert.deepEqual(validateCatalog([entry]), []);
  assert.ok(validateCatalog([{...entry, source: {platform:"threads"}}])
    .some(error => error.includes("unsupported field source")));
  assert.ok(validateCatalog([{...entry, sourceUrl:"https://www.threads.com/@baijiling2?redirect=https://evil.test"}])
    .some(error => error.includes("public Threads profile")));
  assert.ok(validateCatalog([{...entry, submittedBy:"baijiling2"}])
    .some(error => error.includes("must not reuse submittedBy")));
  assert.ok(validateCatalog([{...entry, sourceUrl:"https://www.threads.com/@baijiling2/post/abc123"}]).length === 0);
});
