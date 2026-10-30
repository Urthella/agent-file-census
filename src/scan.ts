#!/usr/bin/env node
// Scans the instruction files of the most-starred repositories. Reads file text through GitHub's API;
// nothing is cloned or run. Usage: node src/scan.ts OUT_DIR [LIMIT]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detect, type Hit } from "./detect.ts";

export const PATHS = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".cursorrules", ".windsurfrules", ".clinerules", ".github/copilot-instructions.md"];
const RULE_DIRS = [".cursor/rules"];
const BATCH = 25;

const gh = (...args: string[]) => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 1 << 28 }));

function topRepos(limit: number): string[] {
  const names: string[] = [];
  for (let page = 1; names.length < limit && page <= 10; page++) {
    const q = encodeURIComponent("stars:>=1000 fork:false archived:false");
    const res = gh(`search/repositories?q=${q}&sort=stars&order=desc&per_page=100&page=${page}`);
    names.push(...res.items.map((r: { full_name: string }) => r.full_name));
  }
  return names.slice(0, limit);
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
  const repos = topRepos(Number(limit));
  const files: FileRecord[] = [];
  const failed: string[] = [];
  const add = (repo: string, path: string, blob: { text: string | null; isTruncated: boolean; isBinary: boolean | null }) => {
    if (blob.isBinary) return;
    const text = blob.text ?? "";
    files.push({ repo, path, bytes: Buffer.byteLength(text), truncated: blob.isTruncated, hits: detect(text) });
  };
  for (let start = 0; start < repos.length; start += BATCH) {
    const batch = repos.slice(start, start + BATCH);
    let data;
    try {
      data = gh("graphql", "-f", `query=${query(batch)}`).data;
    } catch (e) {
      // GraphQL reports a partly failed batch as an error but still returns the rest.
      const body = (e as { stdout?: string }).stdout;
      data = body ? JSON.parse(body).data : null;
      if (!data) {
        failed.push(...batch);
        continue;
      }
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
  }
  writeFileSync(join(out, "repos.json"), JSON.stringify(repos, null, 1));
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
