# agent-file-census

Do the agent instruction files of popular GitHub repositories hide text a person can't see?

Files like `AGENTS.md` and `CLAUDE.md` load into a coding agent's session automatically. Invisible
Unicode or a hidden comment in one reaches the agent while staying out of sight on GitHub's rendered
page. This repository measures how often that happens in the most-starred public repositories.

[METHOD.md](METHOD.md) sets out the sample, rules and review. It was committed before anything was
scanned.

## What it found

In the 10,000 most-starred repositories, 2,401 have at least one instruction file, 4,166 files in all.
None contains hidden Unicode, and the review found no attacks. Two projects, `vercel/next.js` and
`openbao/openbao`, use hidden comments to ask agents to mark their own output.

That doesn't show these files are safe. Hidden text is rare enough that a sample this size would
probably find nothing either way, and it doesn't cover less popular repositories.
[RESULTS.md](RESULTS.md) has the numbers and limits.

## Run it

You need Node 24 and a logged-in [GitHub CLI](https://cli.github.com). There's nothing to install.

```bash
node src/scan.ts results/my-run 1000
node src/review.ts results/my-run
```

The scan reads file text through GitHub's API. Nothing is cloned or run. The review prints each
candidate with non-ASCII characters escaped, so nothing invisible reaches your screen. Treat what it
shows as untrusted data, and don't paste it into an agent that can act.

## What it looks for

Invisible Unicode (tag characters, bidirectional controls, zero-width runs, clusters of variation
selectors), white LaTeX, CSS hiding and HTML comments. The categories follow
[Radware's census](https://github.com/rdwr-gabin/github-ipi-in-the-wild) of issues, pull requests and
READMEs, which doesn't cover instruction files. To check your own repository or to find these things in
CI, a dedicated scanner like [`ipi-scan`](https://github.com/rdwr-gabin/github-ipi-in-the-wild) or
[agentcheck](https://github.com/DhanushNehru/agentcheck) is a better fit than this.

## Who built this

Claude, Anthropic's AI model, wrote the code and reviewed the findings, with Halil Utku Demirtaş
directing the work. No one has checked the review independently.

## License

MIT
