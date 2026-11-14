import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStaticServer } from "./serve.mjs";

test("serves source homepage and generated detail pages with correct content types",async()=>{
  const root=await mkdtemp(join(tmpdir(),"muse-node-server-"));
  const server=createStaticServer(root);
  try {
    await mkdir(join(root,"assets"),{recursive:true});
    await mkdir(join(root,"data"),{recursive:true});
    await mkdir(join(root,"codes","DEMO12"),{recursive:true});
    await mkdir(join(root,"countries"),{recursive:true});
    await writeFile(join(root,"index.html"),"<h1>Muse</h1>");
    await writeFile(join(root,"data","invites.json"),"[]");
    await writeFile(join(root,"assets","styles.css"),"body{}");
    await writeFile(join(root,"codes","DEMO12","index.html"),"<title>Detail</title>");
    await writeFile(join(root,"countries","index.html"),"<title>Country map</title>");
    await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
    const addr="http://127.0.0.1:"+server.address().port;
    for(const [path,part,type] of [
      ["/","Muse","text/html"],["/data/invites.json","[]","application/json"],
      ["/assets/styles.css","body{}","text/css"],
      ["/codes/DEMO12/","Detail","text/html"],["/countries/","Country map","text/html"]
    ]){
      const response=await fetch(addr+path);
      assert.equal(response.status,200,path);
      assert.ok(response.headers.get("content-type").includes(type));
      assert.ok((await response.text()).includes(part));
    }
    const head=await fetch(addr+"/", {method:"HEAD"});
    assert.equal(head.status,200);
    assert.equal(await head.text(),"");
    for(const path of ["/.git/config","/AGENTS.md","/scripts/serve.mjs",
      "/%2e%2e/AGENTS.md","/assets/../../AGENTS.md","/not-found"]){
      assert.equal((await fetch(addr+path)).status,404,path);
    }
    assert.equal((await fetch(addr+"/",{method:"POST"})).status,405);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    await rm(root,{recursive:true,force:true});
  }
});
