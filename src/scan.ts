#!/usr/bin/env node
// Scans the instruction files of the most-starred repositories. Reads file text through GitHub's API;
// nothing is cloned or run. Usage: node src/scan.ts OUT_DIR [LIMIT]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { detect, type Hit } from "./detect.ts";

export const PATHS = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".windsurfrules", ".clinerules", ".github/copilot-instructions.md"];
const RULE_DIRS = [".cursor/rules"];
const BATCH = 25;

const gh = (...args: string[]) => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }));

/** Search returns 1,000 results per query at most, so each query starts where the last one ended. */
async function topRepos(limit: number): Promise<string[]> {
  const names = new Set<string>();
  let ceiling: number | null = null;
  while (names.size < limit) {
    let lowest = Infinity;
    const before = names.size;
    for (let page = 1; page <= 10 && names.size < limit; page++) {
      const q = encodeURIComponent(`stars:${ceiling === null ? ">=1000" : `1000..${ceiling}`} fork:false archived:false`);
      const res = gh(`search/repositories?q=${q}&sort=stars&order=desc&per_page=100&page=${page}`);
      for (const r of res.items as { full_name: string; stargazers_count: number }[]) {
        names.add(r.full_name);
        lowest = Math.min(lowest, r.stargazers_count);
      }
      await sleep(2200); // search allows 30 requests a minute
      if (res.items.length < 100) break;
    }
    if (names.size === before) break; // nothing new: the list has run out
    ceiling = lowest;
  }
  return [...names].slice(0, limit);
}

/** GraphQL rate limits are temporary. A partly failed batch still has data, so that isn't retried. */
async function graphql(q: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return gh("graphql", "-f", `query=${q}`).data;
    } catch (e) {
      const { stdout, stderr } = e as { stdout?: string; stderr?: string };
      let data = null;
      try {
        data = stdout ? JSON.parse(stdout).data : null;
      } catch {
        // not JSON: an HTML error page
      }
      if (data) return data;
      if (attempt >= 4) {
        console.error(`giving up on a batch: ${String(stderr).slice(0, 200)}`);
        return null;
      }
      await sleep(30_000 * 2 ** attempt);
    }
  }
}

const BLOB = "... on Blob { text isTruncated isBinary }";

function query(repos: string[]): string {
  const fields = PATHS.map((p, i) => `f${i}: object(expression: "HEAD:${p}") { ${BLOB} }`);
  const dirs = RULE_DIRS.map((d, i) => `d${i}: object(expression: "HEAD:${d}") { ... on Tree { entries { name object { ${BLOB} } } } }`);
  const parts = repos.map((full, i) => {
    const [owner, name] = full.split("/");
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${[...fields, ...dirs].join(" ")} }`;
  });
  return `query { ${parts.join("\n")} }`;
}

export interface FileRecord {
  repo: string;
  path: string;
  bytes: number;
  truncated: boolean;
  hits: Hit[];
}

async function main() {
  const [out, limit = "1000"] = process.argv.slice(2);
  mkdirSync(out, { recursive: true });
  const repos = await topRepos(Number(limit));
  writeFileSync(join(out, "repos.json"), JSON.stringify(repos, null, 1));
  console.error(`${repos.length} repos listed`);
  const files: FileRecord[] = [];
  const failed: string[] = [];
  const add = (repo: string, path: string, blob: { text: string | null; isTruncated: boolean; isBinary: boolean | null }) => {
    if (blob.isBinary) return;
    const text = blob.text ?? "";
    files.push({ repo, path, bytes: Buffer.byteLength(text), truncated: blob.isTruncated, hits: detect(text) });
  };
  for (let start = 0; start < repos.length; start += BATCH) {
    const batch = repos.slice(start, start + BATCH);
    const data = await graphql(query(batch));
    if (!data) {
      failed.push(...batch);
      continue;
    }
    batch.forEach((repo, i) => {
      const r = data[`r${i}`];
      if (!r) return void failed.push(repo);
      PATHS.forEach((p, j) => r[`f${j}`]?.text !== undefined && add(repo, p, r[`f${j}`]));
      RULE_DIRS.forEach((d, j) => {
        for (const entry of r[`d${j}`]?.entries ?? []) if (entry.object?.text !== undefined) add(repo, `${d}/${entry.name}`, entry.object);
      });
    });
    console.error(`${Math.min(start + BATCH, repos.length)}/${repos.length}`);
    if ((start / BATCH) % 40 === 0) writeFileSync(join(out, "files.json"), JSON.stringify(files, null, 1)); // keep progress if the run dies
  }
  writeFileSync(join(out, "files.json"), JSON.stringify(files, null, 1));
  writeFileSync(join(out, "failed.json"), JSON.stringify(failed));
  console.log(JSON.stringify(summarize(repos, files, failed), null, 1));
}

export function summarize(repos: string[], files: FileRecord[], failed: string[]) {
  const count = <T extends string>(xs: T[]) => Object.fromEntries([...new Set(xs)].sort().map((x) => [x, xs.filter((y) => y === x).length]));
  return {
    reposScanned: repos.length - failed.length,
    failed: failed.length,
    reposWithInstructionFile: new Set(files.map((f) => f.repo)).size,
    files: files.length,
    truncated: files.filter((f) => f.truncated).length,
    filesPerPath: count(files.map((f) => (f.path.startsWith(".cursor/rules/") ? ".cursor/rules/*" : f.path))),
    hitsPerRule: count(files.flatMap((f) => f.hits.map((h) => h.rule))),
    filesWithCandidate: files.filter((f) => f.hits.some((h) => h.rule !== "html-comment")).length,
  };
}

if (import.meta.main) await main();
