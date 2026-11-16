/* Prepare an ephemeral Wrangler config for Cloudflare Workers Builds.
 * Never create or swap BOT_STATE: this KV namespace contains private bot data.
 * GitHub Pages is a separate deployment and must not run this script.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const KV_ID = /^[a-f0-9]{32}$/i;
const SHA = /^[a-f0-9]{40}$/i;
const PLACEHOLDER = "REPLACE_WITH_KV_NAMESPACE_ID";

export function prepareWorkerConfig(source, { namespaceId, revision }) {
  if (typeof source !== "string" ||
      !/^name\s*=\s*"muse-invite-hub-telegram"\s*$/m.test(source) ||
      !/^main\s*=\s*"worker\.mjs"\s*$/m.test(source)) {
    throw Error("Unexpected Wrangler Worker name or entrypoint; refusing deployment");
  }
  const bindings = [...source.matchAll(/^binding\s*=\s*"BOT_STATE"\s*$/gm)];
  const ids = [...source.matchAll(/^id\s*=\s*"([^"]+)"\s*$/gm)];
  if (bindings.length !== 1 || ids.length !== 1) {
    throw Error("Expected exactly one BOT_STATE KV binding and one namespace ID");
  }
  if (!SHA.test(revision || "")) {
    throw Error("A verified 40-character Git commit SHA is required");
  }
  if (/\[vars(?:\.|\])/.test(source)) {
    throw Error("This generator expects no existing [vars] section; review manually");
  }
  const existing = ids[0][1];
  const configured = namespaceId || existing;
  if (!KV_ID.test(configured)) {
    throw Error("MUSE_BOT_STATE_KV_ID must be the EXISTING 32-hex KV namespace ID");
  }
  if (existing !== PLACEHOLDER &&
      (!KV_ID.test(existing) || existing.toLowerCase() !== configured.toLowerCase())) {
    throw Error("Refusing to change an existing BOT_STATE namespace ID");
  }
  const out = source.replace(/^id\s*=\s*"[^"]+"\s*$/m,
    'id = "' + configured.toLowerCase() + '"');
  if (out.includes(PLACEHOLDER)) {
    // Comments mentioning the placeholder are harmless, but active assignments must be resolved.
    if (/^id\s*=\s*"REPLACE_WITH_KV_NAMESPACE_ID"\s*$/m.test(out)) {
      throw Error("Unresolved BOT_STATE KV namespace ID");
    }
  }
  return out.trimEnd() + '\n\n# Public source revision for deployment verification.\n' +
    '[vars]\nBUILD_SHA = "' + revision.toLowerCase() + '"\n';
}

export function revisionFromGit(cwd) {
  const sha = execFileSync("git", ["rev-parse", "--verify", "HEAD"],
    {cwd, encoding:"utf8", stdio:["ignore","pipe","ignore"]}).trim();
  if (!SHA.test(sha)) throw Error("Cannot determine checkout commit revision");
  return sha;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  const dir = dirname(self);
  const input = readFileSync(join(dir,"wrangler.toml"),"utf8");
  const revision = revisionFromGit(dir);
  const prepared = prepareWorkerConfig(input,{
    namespaceId: process.env.MUSE_BOT_STATE_KV_ID,
    revision
  });
  const destination = join(dir,"wrangler.deploy.toml");
  writeFileSync(destination,prepared,{mode:0o600});
  console.log("Prepared Cloudflare Worker deployment for revision " + revision.slice(0,12) +
    " (existing BOT_STATE namespace preserved)");
}
