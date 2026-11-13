import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ORIGIN = "https://muse.eplus.dev";
const CODE = "DPNIHH";
const PATHS = [
  "/", "/countries/", "/countries/index.html", "/codes/" + CODE + "/", "/codes/" + CODE + "/index.html",
  "/assets/styles.css", "/assets/detail.js", "/assets/countries.js", "/assets/countries.css",
  "/data/world-countries.json", "/assets/social-preview.png", "/llms.txt",
  "/sitemap.xml", "/404.html"
];

function sitemapHasCountry(xml, root) {
  return xml.includes("<loc>" + root + "/countries/</loc>");
}

export async function probeProduction({ origin = ORIGIN, get = fetch, nonce = "check" } = {}) {
  const results = new Map();
  const root = origin.replace(/\/+$/, "");
  for (const path of PATHS) {
    const url = root + path + "?muse-health=" + encodeURIComponent(nonce);
    let response;
    try {
      response = await get(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
    } catch (error) {
      throw new Error(path + ": request failed: " + (error.message || error));
    }
    if (!response.ok) throw new Error(path + ": HTTP " + response.status + " (URL " + url + ")");
    const body = path.endsWith(".png") ? await response.arrayBuffer() : await response.text();
    if (!body || (typeof body === "string" && body.trim().length === 0)) {
      throw new Error(path + ": empty response");
    }
    results.set(path, body);
  }
  const homepage = results.get("/");
  const country = results.get("/countries/");
  const countryDirect = results.get("/countries/index.html");
  const countryJS = results.get("/assets/countries.js");
  const countryCSS = results.get("/assets/countries.css");
  const world = results.get("/data/world-countries.json");
  const nested = results.get("/codes/" + CODE + "/");
  const direct = results.get("/codes/" + CODE + "/index.html");
  const css = results.get("/assets/styles.css");
  const js = results.get("/assets/detail.js");
  const image = results.get("/assets/social-preview.png");
  const sitemap = results.get("/sitemap.xml");
  const llms = results.get("/llms.txt");
  const notFound = results.get("/404.html");

  if (!homepage.includes('rel="canonical" href="' + root + '/"')) {
    throw new Error("/: missing production homepage canonical");
  }
  for (const [path, html] of [
    ["/countries/", country], ["/countries/index.html", countryDirect]
  ]) {
    if (!html.includes("<title>Muse Country Availability Map | Muse Invite Hub</title>") ||
        !html.includes('rel="canonical" href="' + root + '/countries/"') ||
        html.includes('content="noindex')) {
      throw new Error(path + ": wrong country page, canonical or robots");
    }
    if (!html.includes('../assets/countries.js') || !html.includes('../assets/countries.css')) {
      throw new Error(path + ": missing relative country assets");
    }
  }
  const mapData = JSON.parse(world);
  if (!countryJS.includes('map-markers') || !countryCSS.includes('.map-panel') ||
      mapData.type !== "FeatureCollection" || !Array.isArray(mapData.features) ||
      !["US", "CA", "JP", "MX"].every(code => mapData.features.some(item => item.code === code))) {
    throw new Error("/countries/: missing or invalid bundled map assets");
  }
  if (!sitemapHasCountry(results.get("/sitemap.xml"), root)) {
    throw new Error("/sitemap.xml: missing indexable country map URL");
  }
  for (const [path, html] of [
    ["/codes/" + CODE + "/", nested], ["/codes/" + CODE + "/index.html", direct]
  ]) {
    if (!html.includes("<title>" + CODE + " Muse Invite Code | Muse Invite Hub</title>")) {
      throw new Error(path + ": wrong document or generic fallback");
    }
    if (!html.includes('rel="canonical" href="' + root + "/codes/" + CODE + '/"')) {
      throw new Error(path + ": missing detail canonical");
    }
    if (html.includes('content="noindex')) throw new Error(path + ": incorrectly marked noindex");
    if (!html.includes('href="../../assets/styles.css"') ||
        !html.includes('src="../../assets/detail.js"')) {
      throw new Error(path + ": broken relative asset references");
    }
    if (!html.includes("BreadcrumbList")) throw new Error(path + ": missing detail structured data");
  }
  if (!css.includes(".detail-page") || !js.includes("detail-copy")) {
    throw new Error("One or more detail assets are stale or missing expected content");
  }
  if (image.byteLength < 500) throw new Error("Social preview image too small");
  if (!llms.startsWith("# Muse Invite Hub") || !llms.includes(root + "/") ||
      !llms.includes("not a live code-validity feed")) {
    throw new Error("/llms.txt: missing or incorrect AI guide");
  }
  if (!notFound.includes('name="robots" content="noindex,nofollow,noarchive"') ||
      !notFound.includes('id="muse-preview-fallback"') ||
      !notFound.includes('window.location.replace')) {
    throw new Error("/404.html: missing deleted-preview redirect handler");
  }
  if (!sitemap.includes("<loc>" + root + "/codes/" + CODE + "/</loc>")) {
    throw new Error("/sitemap.xml: missing indexable detail URL");
  }
  return { checked: PATHS.length, detailPath: "/codes/" + CODE + "/" };
}

export async function verifyProduction({
  origin = ORIGIN,
  get = fetch,
  attempts = 8,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const result = await probeProduction({
        origin, get, nonce: String(i) + "-" + Date.now()
      });
      return { ...result, attempts: i };
    } catch (error) {
      lastError = error;
      console.warn("Production detail check " + i + "/" + attempts + ": " + error.message);
      if (i < attempts) await sleep(6000);
    }
  }
  throw new Error("Production detail verification failed after " + attempts +
    " attempts: " + (lastError?.message || "Unknown failure"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyProduction();
    console.log("Verified " + result.checked + " live production URLs including " +
      result.detailPath + " after " + result.attempts + " attempt(s).");
  } catch (error) {
    console.error("::error::" + error.message);
    process.exitCode = 1;
  }
}
