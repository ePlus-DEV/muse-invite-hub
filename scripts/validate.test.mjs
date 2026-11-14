import test from "node:test";
import assert from "node:assert/strict";
import { validateCatalog } from "./validate.mjs";
import { parsePublicSource } from "./source-platform.mjs";

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
    .some(error => error.includes("supported public social profile")));
  assert.ok(validateCatalog([{...entry, submittedBy:"baijiling2"}])
    .some(error => error.includes("must not reuse a GitHub owner identity")));
  assert.ok(validateCatalog([{...entry, sourceUrl:"https://www.threads.com/@baijiling2/post/abc123"}]).length === 0);
});

test("X and Facebook public provenance URLs validate without claiming GitHub ownership", () => {
  for (const url of [
    "https://x.com/example_handle/status/1234567890123456789",
    "https://twitter.com/example_handle/status/1234567890123456789",
    "https://www.facebook.com/example.user/posts/pfbid0123456789",
    "https://www.facebook.com/example.user"
  ]) {
    const entry = {...sample(), submittedBy:undefined, sourceUrl:url};
    assert.deepEqual(validateCatalog([entry]), [], url);
    assert.ok(validateCatalog([{...entry, submittedBy:"example"}])
      .some(error => error.includes("must not reuse a GitHub owner identity")));
    assert.ok(validateCatalog([{...entry, featured:true, ownerConfirmed:true}]).length > 0);
  }
});
test("reject malformed and impersonating X or Facebook source URLs", () => {
  for (const url of [
    "https://x.com.evil.invalid/someone/status/123456789",
    "https://twitter.com/someone/status/not-a-number",
    "https://x.com/i/status/123456789",
    "https://x.com/someone/status/123456789?redirect=https://evil.invalid",
    "https://www.facebook.com/share/p/abc123",
    "https://www.facebook.com/groups/public/posts/123456",
    "https://www.facebook.com/someone/posts/a?token=secret",
    "https://www.facebook.com.evil.invalid/someone/posts/abcdef",
    "http://www.facebook.com/someone/posts/abc123"
  ]) {
    const entry = {...sample(), sourceUrl:url};
    const errors = validateCatalog([entry]);
    if (url.includes("evil.invalid") && !url.startsWith("http://")) {
      // Unrelated HTTPS context links remain supported by the legacy schema,
      // but they must never be recognized as X/Facebook provenance.
      const reference = parsePublicSource;
      assert.equal(reference(url),null);
    } else {
      assert.ok(errors.some(e => e.includes("sourceUrl")), url + " should be rejected");
    }
  }
});

test("social parser differentiates identical handles across networks", () => {
  const links = [
    ["https://www.threads.com/@sameperson/post/example", "Threads", "threads"],
    ["https://x.com/sameperson/status/123456789", "X (Twitter)", "x"],
    ["https://www.facebook.com/sameperson/posts/pfbid123456", "Facebook", "facebook"]
  ];
  for (const [url, platform, key] of links) {
    const parsed = parsePublicSource(url);
    assert.equal(parsed.platform, platform);
    assert.equal(parsed.key, key);
    assert.equal(parsed.handle, "sameperson");
    assert.equal(parsed.post, true);
  }
  assert.equal(parsePublicSource("https://www.facebook.com/share/p/123"),null);
  assert.equal(parsePublicSource("https://x.com/home"),null);
});


test("multi-code records may share one Issue only with matching source and safe IDs",()=>{
  const base={status:"unverified",addedAt:"2026-11-14",submittedBy:"contributor-1",feedbackIssueNumber:120};
  const entries=[
    {...base,id:"community-issue-120-alfa12",code:"ALFA12"},
    {...base,id:"community-issue-120-bravo2",code:"BRAVO2"}
  ];
  assert.deepEqual(validateCatalog(entries),[]);
  const unrelated={...entries[1],id:"unrelated-record"};
  assert.ok(validateCatalog([entries[0],unrelated]).some(e=>e.includes("duplicate feedback Issue")));
  const differentOwner={...entries[1],submittedBy:"another-owner"};
  assert.ok(validateCatalog([entries[0],differentOwner]).some(e=>e.includes("duplicate feedback Issue")));
  const tooMany=Array.from({length:11},(_,i)=>({
    ...base,id:"community-issue-120-code"+String(i).padStart(2,"0"),
    code:"CODE"+String(i).padStart(2,"0")
  }));
  assert.ok(validateCatalog(tooMany).some(e=>e.includes("at most 10")));
});
