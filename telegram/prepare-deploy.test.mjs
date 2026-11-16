import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { prepareWorkerConfig } from "./prepare-deploy.mjs";

const source = readFileSync(new URL("./wrangler.toml",import.meta.url),"utf8");
const sha = "a".repeat(40);
const id = "b".repeat(32);

test("Worker deploy preparation preserves script identity and pins existing KV",()=>{
  const prepared = prepareWorkerConfig(source,{namespaceId:id,revision:sha});
  assert.match(prepared,/^name = "muse-invite-hub-telegram"$/m);
  assert.match(prepared,/^main = "worker.mjs"$/m);
  assert.match(prepared,/^binding = "BOT_STATE"$/m);
  assert.match(prepared,/^id = "b{32}"$/m);
  assert.match(prepared,/^BUILD_SHA = "a{40}"$/m);
  assert.equal((prepared.match(/^\[vars\]$/gm)||[]).length,1);
  assert.doesNotMatch(prepared,/^id = "REPLACE_WITH_KV_NAMESPACE_ID"$/m);
});

test("fail closed for missing or invalid KV namespace and source revision",()=>{
  for(const kv of [undefined,"","INVALID", "0".repeat(31)]) {
    assert.throws(()=>prepareWorkerConfig(source,{namespaceId:kv,revision:sha}),/EXISTING 32-hex/);
  }
  assert.throws(()=>prepareWorkerConfig(source,{namespaceId:id,revision:"main"}),/Git commit SHA/);
  assert.throws(()=>prepareWorkerConfig(source.replace("muse-invite-hub-telegram","other-worker"),{
    namespaceId:id,revision:sha
  }),/Unexpected Wrangler/);
});

test("never silently switch an existing BOT_STATE namespace",()=>{
  const withId=source.replace("REPLACE_WITH_KV_NAMESPACE_ID",id);
  assert.match(prepareWorkerConfig(withId,{revision:sha}),/^id = "b{32}"$/m);
  assert.throws(()=>prepareWorkerConfig(withId,{
    namespaceId:"c".repeat(32),revision:sha
  }),/Refusing to change/);
  assert.throws(()=>prepareWorkerConfig(withId.replace('binding = "BOT_STATE"','binding = "OTHER"'),{
    revision:sha
  }),/exactly one BOT_STATE/);
});
