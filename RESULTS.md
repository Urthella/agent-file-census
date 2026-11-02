# Results, 2026-10-30

I scanned the agent instruction files of the 10,000 most-starred public GitHub repositories for text a
person can't see. I found no hidden Unicode and no attacks. That's a limited result, as explained
below. [METHOD.md](METHOD.md) was committed before scanning, and the second run was added to it before
that run started.

## Numbers

| | Ranks 1 to 1,000 | Ranks 1,001 to 10,000 | All |
| --- | ---: | ---: | ---: |
| Repositories scanned | 1,000 | 9,000 | 10,000 |
| With at least one instruction file | 395 | 2,006 | 2,401 |
| Files | 755 | 3,411 | 4,166 |
| `tag`, `bidi`, `zero-width`, `vs-cluster`, `white-latex`, `css-hidden` | 0 | 0 | 0 |
| `html-comment-risky` | 1 | 2 | 3 |
| Plain `html-comment` | 153 | 431 | 584 |
| Reviewed as attacks | 0 | 0 | 0 |

No repository failed and one file was truncated. 750 files are under 80 bytes. Many of those look like
short pointers to another file, though I didn't check each one.

| Path | Files |
| --- | ---: |
| `AGENTS.md` | 1,881 |
| `CLAUDE.md` | 1,266 |
| `.cursor/rules/*` | 478 |
| `.github/copilot-instructions.md` | 402 |
| `GEMINI.md` | 78 |
| `.cursorrules` | 45 |
| `.windsurfrules` | 11 |
| `.clinerules` | 5 |

## The three flagged comments

All three matched the risk pattern on a harmless word, and none is an attack:

| Repository | What the comment is |
| --- | --- |
| `ai-job-search-dev/ai-job-search` | A setup note saying `[PLACEHOLDER]` tokens get replaced |
| `alirezarezvani/claude-skills` | A marker quoted in inline code in a changelog, so not really a hidden comment |
| `carbon-design-system/carbon` | A note to maintainers that longer files use more tokens |

## An extra look at the plain comments

The method only called for counting plain comments. Because a comment without a risky word could still
give an agent instructions, I also went through the 367 unique ones. This was decided after the scan,
so treat it as exploratory. It's not a full reading: I read the start of each one, and the end only
for some long ones.

Nearly all are generated-block markers, license headers, or notes to whoever edits the file. I saw no
attack. Two are worth pointing out, because they ask agents to do something a person reading the
rendered file wouldn't see:

| Repository | The hidden comment asks agents to |
| --- | --- |
| `vercel/next.js` | Add a `NEXT_JS_LLM` HTML comment to pull request and issue text and to commit messages |
| `openbao/openbao` | Include a robot emoji in generated output sent to the project |

Both come from the projects themselves and appear to be a way to spot AI-written contributions. By
Radware's definitions they're first-party or defensive, not attacks. I didn't confirm their purpose
with the maintainers.

## What this does and doesn't show

- **Hidden Unicode wasn't found here.** With 0 of 4,166 files, a 95% upper bound is about 0.07% of files
  at these paths in this sample.
- **It doesn't show these files are safer than READMEs.** Radware found real hidden text in 106 of 2
  million READMEs, about 0.005%. At that rate you'd expect about 0.1 repositories among these 2,401, so
  this sample would most likely find nothing either way.
- **It doesn't cover where attacks are likeliest.** These are popular, heavily watched repositories. Low
  star repositories and skill marketplaces could be very different.
- **Text in plain sight isn't covered.** An instruction in ordinary visible words wouldn't be flagged.

## Checks and limits

- **Positive control:** the same GitHub API path and detector caught `tag`, `bidi` and `zero-width`
  characters in the test fixtures of two other scanners, and HTML comments in 56 of 59 READMEs from
  Radware's list. `vs-cluster`, `white-latex` and `css-hidden` were only tested with unit tests.
- **Not covered:** instruction files in subdirectories, skills, commands, hooks and MCP configs.
- **One reviewer:** Claude wrote the scanner and did the review, and no one has checked it independently.
- **Not independent runs:** the first 1,000 repositories are the pilot, and no rule changed between runs.
- **Commit times aren't proof:** they come from the author's machine, and this repository first reached
  GitHub on 2026-11-02, after the scan. The git history shows the order of the work, but nothing
  independent confirms that the method came first.
- **A moving sample:** ranks are approximate, and this is one snapshot of default branches on one day.

Who built this: Claude wrote the code and this page, with Halil Utku Demirtaş directing the work.

The list of repositories and every detector hit from this run are in
[`data/run-10k-2026-10-30`](data/run-10k-2026-10-30). File contents aren't stored, except for the matched text.

To reproduce the scan, run `node src/scan.ts OUT_DIR 10000`, then `node src/review.ts OUT_DIR`. To rerun the positive control, run
`node src/control.ts FINDINGS_JSONL OWNER/REPO...`.
