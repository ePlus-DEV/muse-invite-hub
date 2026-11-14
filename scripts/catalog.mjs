/* Git-friendly per-code records layered on the legacy seed.
 * A trusted build assembles a single data/invites.json for browsers.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const RECORD_DIR = "data/invite-records";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RECORD_PATH = /^data\/invite-records\/([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;
const SHA = /^[a-f0-9]{40}$/;

export function recordPath(record) {
  if (!record || typeof record.id !== "string" || !SLUG.test(record.id)) {
    throw Error("Invalid invite record ID");
  }
  return RECORD_DIR + "/" + record.id + ".json";
}

export function assembleCatalog(paths, readFile) {
  if (!paths.includes("data/invites.json")) throw Error("Missing legacy invite seed");
  const base = JSON.parse(readFile("data/invites.json").toString("utf8"));
  if (!Array.isArray(base)) throw Error("Legacy invite seed must be an array");
  const merged = [...base];
  const positions = new Map(base.map((item, index) => [item?.id, index]));
  if (positions.size !== base.length) throw Error("Duplicate legacy invite IDs");
  const overlays = paths.filter(path => path.startsWith(RECORD_DIR + "/")).sort();
  if (new Set(overlays).size !== overlays.length) throw Error("Duplicate invite record filenames");
  for (const path of overlays) {
    const match = RECORD_PATH.exec(path);
    if (!match) throw Error("Invalid invite record path: " + path);
    const item = JSON.parse(readFile(path).toString("utf8"));
    if (!item || Array.isArray(item) || typeof item !== "object" || item.id !== match[1]) {
      throw Error("Invite record filename must match its record ID: " + path);
    }
    if (positions.has(item.id)) {
      const index = positions.get(item.id);
      if (merged[index]?.code !== item.code) {
        throw Error("Invite record cannot change the original code for ID " + item.id);
      }
      merged[index] = item;
    } else {
      positions.set(item.id, merged.length);
      merged.push(item);
    }
  }
  const codes = new Set();
  for (const entry of merged) {
    if (!entry || typeof entry.code !== "string") throw Error("Invalid invite record");
    if (codes.has(entry.code.toUpperCase())) throw Error("Duplicate invite code: " + entry.code);
    codes.add(entry.code.toUpperCase());
  }
  return merged.sort((a,b) =>
    Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
    String(b.addedAt || "").localeCompare(String(a.addedAt || "")) ||
    String(a.id).localeCompare(String(b.id)));
}

export function readCatalog(root = process.cwd()) {
  const directory = join(root, RECORD_DIR);
  const records = existsSync(directory)
    ? readdirSync(directory).map(name => RECORD_DIR + "/" + name)
    : [];
  return assembleCatalog(["data/invites.json", ...records],
    path => readFileSync(join(root,path)));
}

// GitHub Contents reads are pinned to one immutable commit SHA. Limiting
// concurrency avoids excess secondary API rate limits on large catalogs.
export async function fetchGitHubCatalog(get,sha) {
  if (!SHA.test(sha)) throw Error("Exact commit SHA required for catalog read");
  const seed = await get("contents/data/invites.json?ref=" + sha);
  if (seed?.encoding !== "base64") throw Error("Unexpected legacy catalog encoding");
  const buffers = new Map([["data/invites.json",
    Buffer.from(seed.content.replace(/\s/g, ""),"base64")]]);
  const directory = await get("contents/" + RECORD_DIR + "?ref=" + sha,true);
  if (directory !== null) {
    if (!Array.isArray(directory) || directory.length >= 1000) {
      throw Error("Invite record directory must be complete and below GitHub's 1,000-file limit");
    }
    for (let start = 0; start < directory.length; start += 8) {
      await Promise.all(directory.slice(start,start+8).map(async item => {
        if (item.type !== "file" || !RECORD_PATH.test(item.path) ||
            !SHA.test(item.sha || "") || !Number.isSafeInteger(item.size) ||
            item.size > 16000) throw Error("Invalid remote invite record " + item.path);
        const blob=await get("git/blobs/" + item.sha);
        if (blob?.encoding !== "base64") throw Error("Invalid GitHub blob " + item.path);
        buffers.set(item.path,Buffer.from(blob.content.replace(/\s/g,""),"base64"));
      }));
    }
  }
  return assembleCatalog([...buffers.keys()],path=>buffers.get(path));
}

export function changedRecord(before,after,code) {
  if (!Array.isArray(before) || !Array.isArray(after)) throw Error("Expected catalog arrays");
  const original=new Map(before.map(entry=>[entry.id,entry]));
  const updated=new Map(after.map(entry=>[entry.id,entry]));
  const ids=new Set([...original.keys(),...updated.keys()]);
  const differences=[...ids].filter(id=>
    JSON.stringify(original.get(id))!==JSON.stringify(updated.get(id)));
  const item=after.find(entry=>entry.code===code);
  if (!item || differences.length!==1 || differences[0]!==item.id) {
    throw Error("A contribution must change exactly its own invite record");
  }
  return {path:recordPath(item),content:JSON.stringify(item,null,2)+"\n"};
}

export function changedRecords(before, after, codes) {
  if (!Array.isArray(before) || !Array.isArray(after) ||
      !Array.isArray(codes) || codes.length < 2 ||
      new Set(codes).size !== codes.length) {
    throw Error("Expected distinct invite codes and catalog arrays");
  }
  const original = new Map(before.map(entry => [entry.id, entry]));
  const updated = new Map(after.map(entry => [entry.id, entry]));
  const ids = new Set([...original.keys(), ...updated.keys()]);
  const differences = [...ids].filter(id =>
    JSON.stringify(original.get(id)) !== JSON.stringify(updated.get(id)));
  const items = codes.map(code => after.find(entry => entry.code === code));
  const changedIds = new Set(items.map(item => item?.id));
  if (items.some(item => !item) || changedIds.size !== codes.length ||
      differences.length !== codes.length ||
      differences.some(id => !changedIds.has(id))) {
    throw Error("A multi-code contribution must change exactly its own invite records");
  }
  return items.map(item => ({
    path: recordPath(item),
    content: JSON.stringify(item, null, 2) + "\\n"
  }));
}
