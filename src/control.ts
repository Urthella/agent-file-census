// Positive control: does hidden text survive the same GitHub API path the scan uses, and does the
// detector catch it? Reads fixture files from scanners that test for these tricks, and READMEs where
// Radware's census recorded hidden text.
// Usage: node src/control.ts FINDINGS_JSONL OWNER/REPO...
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { detect, type Rule } from "./detect.ts";

const gh = (...args: string[]) => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }));

function blobText(repo: string, path: string): string | null {
  const [owner, name] = repo.split("/");
  const q = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { object(expression: ${JSON.stringify(`HEAD:${path}`)}) { ... on Blob { text } } } }`;
  return gh("graphql", "-f", `query=${q}`).data.repository?.object?.text ?? null;
}

function tally(texts: (string | null)[]) {
  const rules: Partial<Record<Rule, number>> = {};
  let read = 0, withHit = 0;
  for (const text of texts) {
    if (text === null) continue;
    read++;
    const hits = detect(text);
    if (hits.length) withHit++;
    for (const r of new Set(hits.map((h) => h.rule))) rules[r] = (rules[r] ?? 0) + 1;
  }
  return { read, withHit, filesPerRule: rules };
}

const [findings, ...scanners] = process.argv.slice(2);

for (const repo of scanners) {
  const tree = gh(`repos/${repo}/git/trees/HEAD?recursive=1`).tree as { path: string; type: string; size?: number }[];
  const fixtures = tree.filter((f) => f.type === "blob" && (f.size ?? 0) < 200_000 && /(fixture|sample|example|testdata|test[-_/]|tests\/|malicious|poison)/i.test(f.path) && /\.(md|mdc|txt|cursorrules|windsurfrules)$|cursorrules$/i.test(f.path)).slice(0, 40);
  console.log(repo, { candidates: fixtures.length }, tally(fixtures.map((f) => blobText(repo, f.path))));
}

const rows = readFileSync(findings, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const repos = [...new Set(rows.flatMap((r) => r.repos as string[]))].slice(0, 60);
console.log("radware READMEs", { repos: repos.length }, tally(repos.map((repo) => {
  try {
    return Buffer.from(gh(`repos/${repo}/readme`).content, "base64").toString("utf8");
  } catch {
    return null;
  }
})));
