import { readdirSync, lstatSync, readFileSync } from "node:fs";
import { resolve, join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const INPUTS = ["index.html", "assets", "data", "README.md", "CONTRIBUTING.md",
  "AGENTS.md", "llms.txt", ".github", "scripts"];
const EXTENSIONS = new Set([".js", ".mjs", ".json", ".html", ".md", ".yml", ".yaml", ".css", ".txt"]);

export function findUnrelatedGithubRepos(content) {
  const matches = [];
  const urls = /https?:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)/gi;
  for (const match of String(content).matchAll(urls)) {
    if (match[1].toLowerCase() !== "eplus-dev" || match[2].toLowerCase() !== "muse-invite-hub") {
      matches.push(match[0]);
    }
  }
  return matches;
}
function scan(path, issues) {
  const st = lstatSync(path);
  if (st.isSymbolicLink()) throw Error("Symlink not allowed in content audit: " + path);
  if (st.isDirectory()) {
    for (const child of readdirSync(path)) scan(join(path, child), issues);
    return;
  }
  if (!EXTENSIONS.has(extname(path))) return;
  const text = readFileSync(path, "utf8");
  const urls = findUnrelatedGithubRepos(text);
  if (urls.length) issues.push(relative(ROOT, path) + " references " + urls.join(", "));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = [];
  for (const entry of INPUTS) scan(join(ROOT, entry), errors);
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("✓ No unrelated repository links in website content or tracked text sources.");
  }
}
