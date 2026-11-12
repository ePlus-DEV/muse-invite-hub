import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root=fileURLToPath(new URL("..",import.meta.url));
const scopes=["scripts",".github/workflows","docs"];
const docs=["README.md","CONTRIBUTING.md","AGENTS.md"];
function visit(path) {
  return readdirSync(join(root,path),{withFileTypes:true}).flatMap(entry=>{
    const next=join(path,entry.name);
    return entry.isDirectory()?visit(next):[next];
  });
}

test("all active scripts, workflows and local-run commands remain Node-only",()=>{
  const paths=[...scopes.flatMap(visit),...docs];
  assert.ok(!paths.some(path=>path.endsWith(".py")),"Python source file reintroduced");
  for(const path of paths){
    if(path.endsWith("node-only.test.mjs"))continue;
    if(!/\.(?:md|mjs|js|yml|yaml|py)$/.test(path))continue;
    const text=readFileSync(join(root,path),"utf8");
    assert.doesNotMatch(text,/\bpython3?\s+(?:-m\s+)?(?:http\.server|venv|scripts\/)/i,path);
    assert.doesNotMatch(text,/\bpip3?\s+install\b/i,path);
  }
});
