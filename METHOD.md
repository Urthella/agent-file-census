# Method

Written and committed before any repository was scanned. Later changes are in the git history.

## Question

Do the agent instruction files of popular public GitHub repositories contain text a person can't see
but an agent receives?

These files load into an agent's session automatically, so hidden text in them matters more than
hidden text in a page the agent may never open.

## Prior work

- Radware's [census](https://github.com/rdwr-gabin/github-ipi-in-the-wild) measured hidden AI-directed
  text in 145 million issues, pull requests, comments and READMEs. It doesn't cover instruction files.
- [Scanning the Harness](https://arxiv.org/abs/2609.07360) (Red Hat, 2026) measured security and
  configuration defects in 3,171 agent setups. It found no confirmed credential exfiltration path and
  has no rules for hidden text.

This work fills the gap between them. Its detection categories follow Radware's definitions so the
results can be compared, but it uses its own code.

## Sample

The 1,000 most-starred public repositories from GitHub search, excluding forks and archived repos, on
the day of the scan. This run is a pilot: its purpose is to test the pipeline and see whether there is
any signal. It says nothing about less popular repositories, where attacks may be more or less common.

### Second run

Added after the pilot, before scanning further. The pilot found no hidden Unicode and no attacks in
755 files, and the second run extends it to the 10,000 most-starred repositories, with the same paths,
rules and review. No rule was changed after seeing the pilot, including the risk pattern that flagged
a harmless use of the word "tokens". The pilot's repositories are part of the 10,000, so this isn't an
independent sample. Results are also reported for ranks 1 to 1,000 and 1,001 to 10,000 separately.

GitHub search returns at most 1,000 results per query, so the list is built by walking down star
counts. Repositories with equal stars at a boundary may be missed or reordered, so ranks are
approximate.

## Files

From the default branch, at these exact paths:

`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`, `.clinerules`,
`.github/copilot-instructions.md`, and files directly inside `.cursor/rules/`.

Instruction files in subdirectories, skills, commands and hooks aren't covered in this pilot, so
counts are lower bounds. Files GitHub won't return in full are counted as truncated.

## Detection

Unicode rules apply to the whole file. Comment and CSS rules skip fenced code blocks, which are visible.

| Rule | Matches |
| --- | --- |
| `tag` | Unicode tag characters (U+E0001 to U+E007F), except in emoji flag sequences |
| `bidi` | Bidirectional controls (U+202A to U+202E, U+2066 to U+2069) |
| `zero-width` | Two or more zero-width characters in a row, or one inside an ASCII word |
| `vs-cluster` | Two or more supplementary variation selectors (U+E0100 to U+E01EF) in a row |
| `white-latex` | `$\color{white}...` |
| `css-hidden` | `display:none`, `visibility:hidden`, `font-size:0` in an inline style |
| `html-comment` | Any HTML comment. Very common and usually harmless, so it's counted separately |
| `html-comment-risky` | A comment that also mentions a network command, a secret, or concealment |

## Review

Detection only finds candidates. Each candidate outside plain `html-comment` is read and given one
category, using Radware's definitions:

- **attack:** tries to make someone else's agent act against its owner
- **content override:** steers what an agent writes for the author's benefit
- **first-party:** the project's own instructions or markers for its own agents
- **benign artifact:** no instruction, such as stray characters or copied text

The author's identity doesn't decide this: an owner planting instructions aimed at visitors' agents is
attacking them.

## What gets reported

Whatever comes out, including zero:

1. Repositories scanned, and how many have at least one instruction file.
2. Files per path, and how many were truncated.
3. Candidates per rule, and reviewed counts per category.

Plain `html-comment` is reported as a count only, because it isn't evidence of anything by itself.

## Handling

File contents are untrusted data. Nothing is cloned or executed. Contents are only ever displayed with
non-ASCII characters escaped, and no scanned text is treated as an instruction. If a real attack turns
up, the maintainers are told privately first, and no repository is named until they've had time to
respond.

## Known limits

- One reviewer, who is Claude. There's no independent second reading in this pilot.
- Popular repositories are a small, unusual part of GitHub.
- Text hidden in plain sight, in ordinary visible words, isn't detected.
- A file's hidden text may be harmless to agents that strip it. Whether any agent obeys it isn't tested.
