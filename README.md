# pr-tracker

A Claude Code mod that keeps a small box in the bottom-right corner, just above the prompt, showing the pull request for the branch you are on in the current repository. It reads the PR with the GitHub CLI and refreshes when the session starts, after each turn, and every 60 seconds.

```
                         ╭────────────────────────────────────────────╮
                         │  owner/repo                             ↻ │
                         │ #123 ● OPEN                    +120 −30    │
                         │ Fix the login redirect                     │
                         │ feat/login → main                          │
                         │ ✓5 ✗1 ◷2                     ✓ approved    │
                         ╰────────────────────────────────────────────╯
```

What it shows:

- the repository (from the `origin` remote) and a refresh button
- the PR number (a clickable link), state (open, draft, merged, closed) and lines added/removed
- the PR title, and the head branch → base branch
- CI checks passed, failed and pending, and the review decision
- the border turns red when a check fails; on a branch with no PR it says so, and outside a git repository it hides

Collapse it with `ctrl+x ctrl+a`.

## Requirements

- Claude Code 2.1.287 or later
- [GitHub CLI](https://cli.github.com) installed and signed in (`gh auth login`)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install pr-tracker --marketplace rbpata/pr-tracker
```

Answer `y` to add the marketplace, then choose the user scope so it loads in every session.

From a shell:

```bash
claude plugin install pr-tracker --marketplace rbpata/pr-tracker
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `rbpata/pr-tracker`, then Add plugin.

If the repository is private, it installs only for people who can read it on GitHub and whose machine already has a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`).

## Update

```bash
claude plugin marketplace update pr-tracker && claude plugin update pr-tracker@pr-tracker
```

Then `/reload-plugins` in open sessions.

## License

MIT
