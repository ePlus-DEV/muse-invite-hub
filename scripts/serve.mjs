// Dependency-free local static server for source checkouts and rendered previews.
// Only public website paths are exposed, not Git metadata or private workflow files.
import { createServer as createHttpServer } from "node:http";
import { readFile, stat, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".mjs":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml",
  ".png":"image/png", ".jpg":"image/jpeg", ".jpeg":"image/jpeg",
  ".webp":"image/webp", ".gif":"image/gif", ".ico":"image/x-icon",
  ".mp4":"video/mp4", ".txt":"text/plain; charset=utf-8",
  ".xml":"application/xml; charset=utf-8", ".woff2":"font/woff2"
};
const TOP_LEVEL = new Set(["index.html","404.html","robots.txt","sitemap.xml","llms.txt",
  "CNAME","assets","data","codes","countries","pr-preview"]);

export function createStaticServer(root = process.cwd()) {
  const base = resolve(root);
  return createHttpServer(async (req,res) => {
    res.setHeader("X-Content-Type-Options","nosniff");
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405,{"Allow":"GET, HEAD"});res.end();return;
    }
    let target;
    try {
      const url = new URL(req.url,"http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes("\\") || pathname.includes("\0") ||
          /(?:^|\/)\.{1,2}(?:\/|$)/.test(pathname)) throw Error("Unsafe path");
      const parts = pathname.split("/").filter(Boolean);
      if (parts.some(p=>p.startsWith(".")) ||
          (parts.length && !TOP_LEVEL.has(parts[0]))) throw Error("Hidden or nonpublic path");
      const asset = parts.length ? parts.join("/") : "index.html";
      target=resolve(base,asset);
      const pathStat=await stat(target).catch(()=>null);
      if (pathStat?.isDirectory()) target=resolve(target,"index.html");
      else if (pathname.endsWith("/") && parts.length) throw Error("Directory not found");
      const rel=relative(base,target);
      if (rel===".." || rel.startsWith(".."+sep) || isAbsolute(rel)) throw Error("Path escapes root");
      const real=await realpath(target);
      const actualRel=relative(base,real);
      if (actualRel===".." || actualRel.startsWith(".."+sep) || isAbsolute(actualRel)) throw Error("Symlink escapes root");
      const fileStat=await stat(real);
      if (!fileStat.isFile()) throw Error("Not a file");
      const data=await readFile(real);
      res.writeHead(200,{"Content-Type":TYPES[extname(real).toLowerCase()] ||
        "application/octet-stream","Content-Length":data.length,"Cache-Control":"no-store"});
      if (req.method==="HEAD") res.end();else res.end(data);
    } catch {
      res.writeHead(404,{"Content-Type":"text/plain; charset=utf-8"});
      res.end("Not found");
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port=Number(process.argv[3] || process.env.PORT || 8000);
  const directory=process.argv[2] || ".";
  if (!Number.isInteger(port) || port<1 || port>65535) {
    console.error("Usage: node scripts/serve.mjs [directory] [port 1-65535]");
    process.exitCode=1;
  } else {
    const server=createStaticServer(directory);
    server.listen(port,"127.0.0.1",()=>console.log(
      "Serving "+resolve(directory)+" at http://127.0.0.1:"+port+"/"));
  }
}
