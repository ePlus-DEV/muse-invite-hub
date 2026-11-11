import test from "node:test";
import assert from "node:assert/strict";
import { findUnrelatedGithubRepos } from "./audit-links.mjs";

test("our own repository and GitHub user profiles are permitted", () => {
  const content = "https://github.com/ePlus-DEV/muse-invite-hub/issues/14\n" +
    "https://github.com/some-contributor";
  assert.deepEqual(findUnrelatedGithubRepos(content), []);
});
test("a link to an unrelated GitHub repository is rejected", () => {
  const content = "https://github.com/" + "other-organization" + "/" + "unrelated-project" + "/issues/1";
  assert.equal(findUnrelatedGithubRepos(content).length, 1);
});
test("unrelated non-GitHub links remain allowed", () => {
  assert.deepEqual(findUnrelatedGithubRepos("https://muse.ai/join"), []);
});
