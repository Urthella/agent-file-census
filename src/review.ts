// Prints every candidate for review, with its surroundings. All text is escaped: nothing invisible
// reaches the screen, and tag characters are shown decoded. Usage: node src/review.ts RESULTS_DIR
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeTags, escapeForDisplay } from "./detect.ts";
import type { FileRecord } from "./scan.ts";

const dir = process.argv[2];
const files: FileRecord[] = JSON.parse(readFileSync(join(dir, "files.json"), "utf8"));
const repos: string[] = JSON.parse(readFileSync(join(dir, "repos.json"), "utf8"));

for (const f of files) {
  const hits = f.hits.filter((h) => h.rule !== "html-comment");
  if (!hits.length) continue;
  const q = `query { repository(owner: ${JSON.stringify(f.repo.split("/")[0])}, name: ${JSON.stringify(f.repo.split("/")[1])}) { stargazerCount object(expression: ${JSON.stringify(`HEAD:${f.path}`)}) { ... on Blob { text } } } }`;
  const data = JSON.parse(execFileSync("gh", ["api", "graphql", "-f", `query=${q}`], { encoding: "utf8", maxBuffer: 1 << 26 })).data.repository;
  const text: string = data?.object?.text ?? "";
  console.log(`\n=== rank ${repos.indexOf(f.repo) + 1} ${f.repo} ${f.path} stars=${data?.stargazerCount} bytes=${f.bytes} hits=${hits.length}`);
  for (const h of hits.slice(0, 6)) {
    const around = text.slice(Math.max(0, h.index - 120), h.index + h.length + 120);
    const body = h.length > 500 ? `${around.slice(0, 500)}...` : around;
    console.log(`[${h.rule}] at ${h.index}, length ${h.length}: ${escapeForDisplay(h.rule === "tag" ? decodeTags(body) : body)}`);
  }
}
