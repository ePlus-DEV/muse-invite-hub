// Trusted, shared classification for public social provenance across catalog, details and Issues.
// Facebook URLs are flexible references; ambiguous attribution stays review-only.
export const SOCIAL_PLATFORMS = ["Threads", "X (Twitter)", "Facebook", "Telegram"];
export const LISTING_PLATFORMS = ["GitHub", ...SOCIAL_PLATFORMS];

export function parsePublicSource(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const path = url.pathname;
    const facebookHost = ["facebook.com","www.facebook.com","m.facebook.com","mbasic.facebook.com","web.facebook.com","fb.com","www.fb.com","fb.watch"].includes(host);
    if (!facebookHost && (url.search || url.hash)) return null;
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
    if (["t.me", "www.t.me"].includes(host)) {
      const hit = /^\/([A-Za-z][A-Za-z0-9_]{4,31})(?:\/([1-9][0-9]{0,18}))?\/?$/.exec(path);
      const reserved = new Set(["share","joinchat","login","addstickers","proxy","socks","addemoji"]);
      return hit && !reserved.has(hit[1].toLowerCase())
        ? {platform:"Telegram",key:"telegram",handle:hit[1],url:url.href,post:Boolean(hit[2])} : null;
    }
    if (facebookHost) {
      // Preserve a usable Facebook reference, without guessing an author.
      if (url.username || url.password || url.port || /^(?:\/(?:l\.php|flx\/warn|login(?:\.php)?|checkpoint)(?:\/|$))/i.test(path) || [...url.searchParams.keys()].some(key => /^(?:access_token|token|auth|auth_token|session|session_id|password|code|signed_request)$/i.test(key))) return null;
      const groupPost = /^\/groups\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})(?:\/(?:posts|permalink)\/[^/]+)?\/?$/.exec(path);
      if (groupPost) return {platform:"Facebook",key:"facebook",handle:groupPost[1],
        url:url.href,post:/\/(?:posts|permalink)\//.test(path),group:true};
      const hit = /^\/([A-Za-z0-9.]{2,50})(?:\/posts\/([A-Za-z0-9_-]{4,120}))?\/?$/.exec(path);
      const reserved = new Set(["share","groups","watch","reel","reels","events","marketplace","people","pages","profile.php","permalink.php","photo.php","story.php","login"]);
      if (["facebook.com","www.facebook.com","m.facebook.com"].includes(host) &&
          hit && !reserved.has(hit[1].toLowerCase()) && hit[2] && !url.search && !url.hash) {
        return {platform:"Facebook",key:"facebook",handle:hit[1],url:url.href,post:true};
      }
      // Profiles, share links, reels, query URLs and unknown layouts are references only.
      return {platform:"Facebook",key:"facebook",handle:null,url:url.href,post:false,reviewOnly:true};
    }
  } catch { /* Unknown or malformed URLs must never be used as attribution. */ }
  return null;
}
export function listedPlatform(item) {
  return parsePublicSource(item?.sourceUrl)?.platform || "GitHub";
}
