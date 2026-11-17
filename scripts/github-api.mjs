// Retry only safe GitHub GETs when the upstream API is temporarily unavailable.
// Do not retry authentication/permission errors or GitHub write requests.
const TRANSIENT_HTTP = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const REQUEST_TIMEOUT_MS = 25_000;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryDelay(attempt, response) {
  const header = response?.headers?.get?.("retry-after");
  const seconds = header && /^\d+$/.test(header.trim()) ? Number(header) : 0;
  return Math.min(10_000, Math.max(750 * 2 ** attempt, seconds * 1000));
}

function transientNetworkError(error) {
  return error instanceof TypeError || error?.name === "TimeoutError" || error?.name === "AbortError";
}

export async function fetchGitHubJson(path, token, { fetchImpl = fetch, sleep = wait, warn = console.warn } = {}) {
  if (!/^repos\/ePlus-DEV\/muse-invite-hub\/[a-zA-Z0-9_/?=&.\/-]+$/.test(path)) {
    throw Error("Invalid GitHub API path");
  }
  if (!token) throw Error("Missing GitHub API token");

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetchImpl("https://api.github.com/" + path, {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS - 1 || !transientNetworkError(error)) throw error;
      const delay = retryDelay(attempt);
      warn("Transient GitHub API connection error; retry " + (attempt + 1) + "/" + (MAX_ATTEMPTS - 1));
      await sleep(delay);
      continue;
    }

    if (response.ok) return response.json();
    if (!TRANSIENT_HTTP.has(response.status) || attempt === MAX_ATTEMPTS - 1) {
      throw Error("GitHub API " + response.status + ": " + path);
    }
    const delay = retryDelay(attempt, response);
    warn("GitHub API " + response.status + "; retry " + (attempt + 1) + "/" + (MAX_ATTEMPTS - 1));
    await sleep(delay);
  }
}
