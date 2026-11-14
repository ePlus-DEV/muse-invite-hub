import test from "node:test";
import assert from "node:assert/strict";
import { assembleCatalog, changedRecord, recordPath } from "./catalog.mjs";
import { validateCatalog } from "./validate.mjs";

const entry=(id,code,addedAt="2026-11-13")=>({
  id,code,addedAt,status:"unverified",submittedBy:"community"
});
function assemble(base,overlays={}) {
  const files=new Map([["data/invites.json",JSON.stringify(base)],...Object.entries(overlays)]);
  return assembleCatalog([...files.keys()],path=>Buffer.from(files.get(path)));
}
test("two simultaneous codes use independent paths and one generated catalog",()=>{
  const base=[entry("old-code","ORIG12","2026-11-11")];
  const a=entry("community-issue-94","1X1Y90");
  const b=entry("community-issue-96","OTHER6");
  const entries=assemble(base,{[recordPath(a)]:JSON.stringify(a),[recordPath(b)]:JSON.stringify(b)});
  assert.deepEqual(entries.map(e=>e.code),["1X1Y90","OTHER6","ORIG12"]);
  assert.deepEqual(validateCatalog(entries),[]);
  assert.notEqual(changedRecord(base,[a,...base],a.code).path,
    changedRecord(base,[b,...base],b.code).path);
});
test("owner quota update overrides only its stable legacy record",()=>{
  const previous=entry("old-code","ORIG12");
  const next={...previous,reportedRemaining:3,usageReportedAt:"2026-11-14"};
  assert.deepEqual(assemble([previous],{[recordPath(next)]:JSON.stringify(next)}),[next]);
  assert.equal(changedRecord([previous],[next],next.code).path,recordPath(previous));
});
test("same code with different IDs fails validation even across separate files",()=>{
  const a=entry("community-issue-94","1X1Y90"),b=entry("community-issue-96","1X1Y90");
  assert.throws(()=>assemble([],{[recordPath(a)]:JSON.stringify(a),
    [recordPath(b)]:JSON.stringify(b)}),/Duplicate invite code/);
});
test("wrong filenames and identity changes are blocked",()=>{
  const a=entry("old-code","ORIG12");
  assert.throws(()=>assemble([],{["data/invite-records/other.json"]:JSON.stringify(a)}),/filename must match/);
  assert.throws(()=>assemble([a],{[recordPath(a)]:JSON.stringify({...a,code:"FAKE12"})}),/cannot change/);
  assert.throws(()=>assemble([],{["data/invite-records/../bad.json"]:"{}"}),/Invalid invite record path/);
  assert.throws(()=>changedRecord([a],[a],a.code),/exactly its own/);
});
