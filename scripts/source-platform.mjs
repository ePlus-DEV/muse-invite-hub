// Trusted, shared classification for public social provenance across catalog, details and Issues.
// URL validation is intentionally strict; unsupported links require human review.
export const SOCIAL_PLATFORMS = ["Threads", "X (Twitter)", "Facebook"];
export const LISTING_PLATFORMS = ["GitHub", ...SOCIAL_PLATFORMS];

export function parsePublicSource(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    if (["threads.com", "www.threads.com"].includes(host)) {
      const hit = /^\/@([A-Za-z0-9_.]{1,30})(?:\/post\/([A-Za-z0-9_-]+))?\/?$/.exec(path);
      return hit ? {platform:"Threads",key:"threads",handle:hit[1],url:url.href,post:Boolean(hit[2])} : null;
    }
    if (["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(host)) {
      const hit = /^\/([A-Za-z0-9_]{1,15})(?:\/status\/([0-9]{5,25}))?\/?$/.exec(path);
      const reserved = new Set(["i","home","search","explore","intent","share","settings","messages"]);
      return hit && !reserved.has(hit[1].toLowerCase())
        ? {platform:"X (Twitter)",key:"x",handle:hit[1],url:url.href,post:Boolean(hit[2])} : null;
    }
    if (["facebook.com", "www.facebook.com", "m.facebook.com"].includes(host)) {
      const hit = /^\/([A-Za-z0-9.]{2,50})(?:\/posts\/([A-Za-z0-9_-]{4,120}))?\/?$/.exec(path);
      const reserved = new Set(["share","groups","watch","reel","reels","events","marketplace","people","pages","profile.php","permalink.php","photo.php","login"]);
      return hit && !reserved.has(hit[1].toLowerCase())
        ? {platform:"Facebook",key:"facebook",handle:hit[1],url:url.href,post:Boolean(hit[2])} : null;
    }
  } catch { /* Unknown or malformed URLs must never be used as attribution. */ }
  return null;
}
export function listedPlatform(item) {
  return parsePublicSource(item?.sourceUrl)?.platform || "GitHub";
}
