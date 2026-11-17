import test from "node:test";
import assert from "node:assert/strict";
import { fetchGitHubJson } from "./github-api.mjs";

const path = "repos/ePlus-DEV/muse-invite-hub/issues?state=all&per_page=100&page=1";
const response = (status, value = [], headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => headers[name] ?? null },
  json: async () => value
});

function harness(responses) {
  let calls = 0;
  const delays = [];
  const warnings = [];
  const options = {
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.github.com/" + path);
      assert.equal(init.method, "GET");
      assert.equal(init.headers.Authorization, "Bearer TEST_TOKEN");
      const next = responses[calls++];
      if (next instanceof Error) throw next;
      return next;
    },
    sleep: async ms => delays.push(ms),
    warn: text => warnings.push(text)
  };
  return {options, delays, warnings, calls:()=>calls};
}

test("GitHub API 502 retries then returns the Issues array", async () => {
  const h = harness([response(502), response(503), response(200, [{number:262}])]);
  assert.deepEqual(await fetchGitHubJson(path,"TEST_TOKEN",h.options),[{number:262}]);
  assert.equal(h.calls(),3);
  assert.deepEqual(h.delays,[750,1500]);
  assert.equal(h.warnings.length,2);
});

test("HTTP 429 respects Retry-After with bounded delay", async () => {
  const h = harness([response(429,[],{"retry-after":"3"}),response(200,[{number:265}])]);
  assert.deepEqual(await fetchGitHubJson(path,"TEST_TOKEN",h.options),[{number:265}]);
  assert.deepEqual(h.delays,[3000]);
});

test("non-transient failures 401, 403, 404 do not retry", async () => {
  for (const status of [401,403,404]) {
    const h=harness([response(status)]);
    await assert.rejects(fetchGitHubJson(path,"TEST_TOKEN",h.options),new RegExp("GitHub API "+status));
    assert.equal(h.calls(),1);
    assert.deepEqual(h.delays,[]);
  }
});

test("persistent HTTP 502 fails closed after four requests", async () => {
  const h=harness([response(502),response(502),response(502),response(502)]);
  await assert.rejects(fetchGitHubJson(path,"TEST_TOKEN",h.options),/GitHub API 502/);
  assert.equal(h.calls(),4);
  assert.deepEqual(h.delays,[750,1500,3000]);
});

test("temporary network errors retry but unrelated errors fail immediately", async () => {
  const h=harness([new TypeError("fetch failed"),response(200,[])]);
  assert.deepEqual(await fetchGitHubJson(path,"TEST_TOKEN",h.options),[]);
  assert.equal(h.calls(),2);
  const fatal=harness([new Error("logic error")]);
  await assert.rejects(fetchGitHubJson(path,"TEST_TOKEN",fatal.options),/logic error/);
  assert.equal(fatal.calls(),1);
});

test("only expected repository GET paths and a token are accepted", async () => {
  let touched=false;
  const fake=async()=>{touched=true;return response(200,[]);};
  await assert.rejects(fetchGitHubJson("repos/another/repo/issues","TEST_TOKEN",{fetchImpl:fake}),/Invalid GitHub API path/);
  await assert.rejects(fetchGitHubJson(path,"",{fetchImpl:fake}),/Missing GitHub API token/);
  assert.equal(touched,false);
});
