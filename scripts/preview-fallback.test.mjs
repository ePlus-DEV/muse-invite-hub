import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../404.html", import.meta.url), "utf8");
const script = html.match(/<script id="muse-preview-fallback">([\s\S]*?)<\/script>/)?.[1];
if (!script) throw Error("Missing Pages 404 preview fallback script");

async function navigate(path, { published = ["DPNIHH", "18I70N"], unavailable = false } = {}) {
  const url = new URL(path, "https://muse.eplus.dev");
  let redirect = null, calls = 0;
  const window = {
    location: {
      pathname: url.pathname, origin: url.origin, search: url.search, hash: url.hash,
      replace(value) { redirect = value; }
    }
  };
  runInNewContext(script, {
    window, URL,
    document: { getElementById() { return { textContent: "" }; } },
    fetch: async (request, opts) => {
      calls += 1;
      assert.equal(request, "/data/invites.json");
      assert.equal(opts.cache, "no-store");
      if (unavailable) throw Error("Network unavailable");
      return { ok: true, json: async () => published.map(code => ({code})) };
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  return {redirect, calls};
}

test("fallback is non-indexable, self-contained and published from trusted main", () => {
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /href="\/">Go to Muse Invite Hub/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
  const builder = readFileSync(new URL("./build-pages.mjs", import.meta.url), "utf8");
  assert.match(builder, /"404\.html"/);
  const deploy = readFileSync(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(deploy, /test -s _site\/404\.html/);
});

test("deleted preview root and explicit index redirect to production homepage", async () => {
  for (const path of [
    "/pr-preview/pr-44/", "/pr-preview/pr-44",
    "/pr-preview/pr-44/index.html", "/pr-preview/pr-9999/unknown/"
  ]) {
    assert.deepEqual(await navigate(path), {redirect:"https://muse.eplus.dev/", calls:0});
  }
});

test("expired country map previews redirect to canonical production map", async () => {
  for (const path of ["/pr-preview/pr-44/countries/", "/pr-preview/pr-44/countries/index.html"]) {
    assert.deepEqual(await navigate(path), {redirect:"https://muse.eplus.dev/countries/",calls:0});
  }
});

test("deleted preview detail routes navigate to published production detail URL", async () => {
  for (const path of [
    "/pr-preview/pr-44/codes/DPNIHH/",
    "/pr-preview/pr-44/codes/DPNIHH/index.html"
  ]) {
    assert.deepEqual(await navigate(path), {
      redirect:"https://muse.eplus.dev/codes/DPNIHH/", calls:1
    });
  }
  assert.deepEqual(await navigate("/pr-preview/pr-44/codes/18I70N/?from=old#status"), {
    redirect:"https://muse.eplus.dev/codes/18I70N/?from=old#status", calls:1
  });
});

test("PR-only or unreachable catalog routes fall back to Home instead of a second 404", async () => {
  assert.deepEqual(await navigate("/pr-preview/pr-40/codes/ZZZZ99/", {published:["DPNIHH"]}), {
    redirect:"https://muse.eplus.dev/", calls:1
  });
  assert.deepEqual(await navigate("/pr-preview/pr-40/codes/DPNIHH/", {unavailable:true}), {
    redirect:"https://muse.eplus.dev/", calls:1
  });
});

test("ordinary 404s and invalid preview identifiers do not redirect", async () => {
  for (const path of [
    "/does-not-exist", "/codes/ZZZZ99/", "/pr-preview/manifest.json",
    "/pr-preview/pr-zero/", "/pr-preview/pr-0/", "/pr-preview/pr-44x/", "/preview/pr-44/"
  ]) assert.deepEqual(await navigate(path), {redirect:null, calls:0});
});

test("untrusted preview suffixes cannot create external redirects", async () => {
  for (const path of [
    "/pr-preview/pr-44/https:%2F%2Fevil.example/",
    "/pr-preview/pr-44/codes/%2e%2e/",
    "/pr-preview/pr-44/codes/DPNIHH/extra/"
  ]) assert.deepEqual(await navigate(path), {redirect:"https://muse.eplus.dev/", calls:0});
});
