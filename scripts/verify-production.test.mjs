import test from "node:test";
import assert from "node:assert/strict";
import { probeProduction, verifyProduction } from "./verify-production.mjs";

const root = "https://muse.eplus.dev";
const detail = '<!doctype html><html><head><title>DPNIHH Muse Invite Code | Muse Invite Hub</title><link rel="canonical" href="' +
  root + '/codes/DPNIHH/"></head><body><a href="../../assets/styles.css">Styles</a>' +
  '<script src="../../assets/detail.js"></script><script type="application/ld+json">"BreadcrumbList"</script></body></html>';
const country = '<!doctype html><title>Muse Country Availability Map | Muse Invite Hub</title>' +
  '<link rel="canonical" href="' + root + '/countries/"><link href="../assets/countries.css"><script src="../assets/countries.js"></script>';
const geo = JSON.stringify({type:"FeatureCollection",features:["US","CA","JP","MX"].map(code => ({code,geometry:{type:"Polygon",coordinates:[]}}))});
const pages = {
  "/countries/": country,
  "/countries/index.html": country,
  "/assets/countries.js": "const places = document.getElementById('map-markers');",
  "/assets/countries.css": ".map-panel{display:block}",
  "/data/world-countries.json": geo,
  "/": '<link rel="canonical" href="' + root + '/">',
  "/codes/DPNIHH/": detail,
  "/codes/DPNIHH/index.html": detail,
  "/assets/styles.css": "body{} .detail-page{}",
  "/assets/detail.js": 'document.getElementById("detail-copy")',
  "/assets/social-preview.png": "a".repeat(600),
  "/llms.txt": "# Muse Invite Hub\n\nThis is not a live code-validity feed.\n\n- [Home](" + root + "/): Browse codes.\n",
  "/sitemap.xml": "<url><loc>" + root + "/countries/</loc></url><url><loc>" + root + "/codes/DPNIHH/</loc></url>",
  "/404.html": '<meta name="robots" content="noindex,nofollow,noarchive"><script id="muse-preview-fallback">window.location.replace</script>'
};
function mockGet(overrides = {}) {
  return async url => {
    const path = new URL(url).pathname;
    const data = { ...pages, ...overrides };
    if (data[path] === null || data[path] === undefined) return new Response("404", {status:404});
    return new Response(data[path], {status:200});
  };
}
test("verifies production directory route, explicit HTML, JS/CSS and sitemap", async () => {
  const result = await probeProduction({get:mockGet()});
  assert.deepEqual(result, {checked:14,detailPath:"/codes/DPNIHH/"});
});
test("fails when the pretty URL returns 404 even if index.html works", async () => {
  await assert.rejects(
    probeProduction({get:mockGet({"/codes/DPNIHH/":null})}),
    /\/codes\/DPNIHH\/: HTTP 404/
  );
});
test("fails when a server returns homepage as the detail route", async () => {
  await assert.rejects(
    probeProduction({get:mockGet({"/codes/DPNIHH/":pages["/"]})}),
    /wrong document or generic fallback/
  );
});
test("fails if detail is noindex or sitemap lacks the page", async () => {
  await assert.rejects(
    probeProduction({get:mockGet({"/codes/DPNIHH/":detail.replace("</head>",'<meta name="robots" content="noindex"></head>')})}),
    /incorrectly marked noindex/
  );
  await assert.rejects(
    probeProduction({get:mockGet({"/sitemap.xml":"<urlset/>"})}),
    /missing indexable detail URL/
  );
});
test("fails if country map or its geometry is missing from production", async () => {
  await assert.rejects(probeProduction({get:mockGet({"/countries/":null})}), /countries\/: HTTP 404/);
  await assert.rejects(probeProduction({get:mockGet({"/data/world-countries.json":null})}), /world-countries\.json: HTTP 404/);
});

test("fails when the public AI discovery file is missing", async () => {
  await assert.rejects(probeProduction({get:mockGet({"/llms.txt":null})}), /llms.txt: HTTP 404/);
});
test("fails if the trusted Pages fallback handler is absent", async () => {
  await assert.rejects(probeProduction({get:mockGet({"/404.html":null})}), /404\.html: HTTP 404/);
  await assert.rejects(probeProduction({get:mockGet({"/404.html":"generic 404"})}), /missing deleted-preview redirect handler/);
});
test("a transient 404 can recover before production verification fails", async () => {
  let attempts=0;
  const get=async (url,opts)=>{
    if(new URL(url).pathname==="/codes/DPNIHH/" && attempts++===0)return new Response("missing",{status:404});
    return mockGet()(url,opts);
  };
  const result=await verifyProduction({get,attempts:2,sleep:async()=>{}});
  assert.equal(result.attempts,2);
});
