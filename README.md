# Release Notes Pipeline

Automated release notes — daily Slack digests, weekly AI-generated product summaries, and monthly marketing updates — driven entirely by PR labels and merge activity.

## How it works

1. **Every PR** must have a `scope:` label, a `change:` label, and a filled `## Outcome` section (enforced by CI).
2. **Daily** (07:00 UTC, Mon–Fri): picks up all PRs merged since the last run that carry `change:release`, groups them by scope, posts to Slack, and creates a GitHub Pre-release as a data store.
3. **Weekly** (Friday 07:00 UTC): aggregates the week's daily releases, sends them to Claude to produce a customer-facing summary, posts to Slack, and saves as a GitHub Release.
4. **Monthly** (first Monday 07:00 UTC): aggregates the last 4 weekly releases through Claude for a marketing-ready monthly update, posts to Slack.

## Labels

| Label | Purpose |
|---|---|
| `scope:fe` `scope:be` `scope:ml` `scope:data` | Which part of the system changed |
| `change:feat` | New feature |
| `change:fix` | Bug fix |
| `change:perf` | Performance improvement |
| `change:breaking` | Breaking change |
| `change:refactor` `change:chore` `change:docs` | Internal |
| `change:release` | **Include in daily release notes** |
| `change:release-ff` | Fast-forward / internal merge — never shown externally |

## Secrets required

| Secret | Value |
|---|---|
| `SLACK_WEBHOOK_RELEASES` | Slack incoming webhook URL |
| `ANTHROPIC_API_KEY` | Claude API key (for weekly + monthly summaries) |
| `KNOWLEDGE_HUB_ENDPOINT` | Optional — REST endpoint to push daily payload |
| `KNOWLEDGE_HUB_TOKEN` | Optional — Bearer token for Knowledge Hub |

## Setup guide for a new repo

See [`SETUP.md`](SETUP.md) for full step-by-step instructions including backfill procedures.
