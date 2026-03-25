# Claude Code Build Plan — Release Notes Automation

## How to run this

Paste the prompt at the bottom of this document into Claude Code. It will work through every phase autonomously using the GH CLI — creating branches, opening PRs, merging them, and verifying the output at each step before moving on. No interruptions unless something breaks.

---

## Phases

### Phase 1 — Repository setup
- Create all required GitHub labels (`scope:fe`, `scope:be`, `scope:ml`, `scope:data`, `change:feat`, `change:fix`, `change:perf`, `change:breaking`, `change:refactor`, `change:chore`, `change:docs`, `change:release`, `change:release-ff`) via GH CLI
- Create `.github/scripts/` directory with a `package.json` for script dependencies (`@octokit/rest`, `@slack/webhook`)
- **Verify:** `gh label list` returns all expected labels

### Phase 2 — CI label check
- Write `.github/workflows/pr-label-check.yml`
  - Triggers on `pull_request` events
  - Checks at least one `scope:` label exists
  - Checks at least one `change:` type label exists
  - Checks `change:release` and `change:release-ff` are not both present
  - Posts an inline PR comment if check fails with instructions
- Open a test PR via GH CLI **without** labels → verify check fails
- Add correct labels via GH CLI → verify check passes
- Merge the PR
- **Verify:** workflow run shows green in `gh run list`

### Phase 3 — Daily workflow
- Write `.github/scripts/generate-daily.js`
  - Reads last run timestamp from a git tag (`last-daily-run`)
  - Fetches all merged PRs since that tag with `change:release` label via GitHub API
  - Extracts title + PR body outcome section per PR
  - Formats into a structured daily release payload
- Write `.github/workflows/release-daily.yml`
  - Cron: `0 7 * * 1-5`
  - `workflow_dispatch` trigger for manual runs
  - Calls `generate-daily.js`
  - Posts formatted output to Slack via webhook
  <!-- - Pushes payload to Knowledge Hub (configurable endpoint) -->
  - Creates or updates `last-daily-run` git tag
- Merge a test PR with `change:release` label via GH CLI
- Trigger workflow manually via `gh workflow run`
- **Verify:** Slack message appears, git tag updated, Knowledge Hub receives payload

### Phase 4 — Weekly workflow
- Write `.github/scripts/generate-weekly.js`
  - Fetches daily release payloads from github releases 
  - Sends aggregated data to Claude API with weekly marketing prompt
  - Returns formatted marketing summary
- Write `.github/workflows/release-weekly.yml`
  - Cron: `0 7 * * 5`
  - `workflow_dispatch` trigger
  - Calls `generate-weekly.js`
- Trigger manually via `gh workflow run`
- **Verify:** Claude response is coherent, Slack message appears with correct tag

### Phase 5 — Monthly workflow
- Write `.github/scripts/generate-monthly.js`
  - Fetches daily release payloads from github releases 
  - Sends to Claude API with monthly marketing prompt
  - Returns longer narrative summary
- Write `.github/workflows/release-monthly.yml`
  - Cron: `0 7 1-7 * 1` (first Monday of each month)
  - `workflow_dispatch` trigger
  - Calls `generate-monthly.js`
- Trigger manually via `gh workflow run`
- **Verify:** Claude response covers full month scope, Slack message appears

### Phase 6 — Claude prompts
- Write `prompts/daily-release.md` — technical tone, bullet format, based on PR titles + outcomes
- Write `prompts/weekly-marketing.md` — short, punchy, customer-facing, ~150 words
- Write `prompts/monthly-marketing.md` — narrative, impact-focused, ~400 words
- Each prompt includes instructions to exclude `change:release-ff` items from customer-facing copy
- Re-trigger weekly and monthly workflows with final prompts
- **Verify:** outputs reviewed and approved

### Phase 7 — End-to-end test
- Merge 3–5 test PRs with varied labels via GH CLI
- Wait for or manually trigger daily workflow
- Verify Slack output 
<!-- and Knowledge Hub entry -->
- Trigger weekly workflow, verify Claude summary covers the test PRs
- Confirm `change:release-ff` PRs are absent from marketing copy
- **Verify:** full pipeline runs clean from PR merge to Slack

---

## Required secrets

Before Phase 3, the following must be set in the repo:

```
gh secret set ANTHROPIC_API_KEY
gh secret set SLACK_WEBHOOK_RELEASES
gh secret set KNOWLEDGE_HUB_ENDPOINT
gh secret set KNOWLEDGE_HUB_TOKEN
```

---

## Claude Code prompt

Paste this verbatim to start the build:

```
You are building a release notes automation pipeline for a monorepo. Work through the following phases autonomously and in order. Use the GH CLI for all GitHub operations. After each phase, verify the outcome before moving to the next. Do not ask for confirmation between steps unless a verification fails.

The repo has four services: fe, be, ml, data.

Required secrets are already set: ANTHROPIC_API_KEY, SLACK_WEBHOOK_RELEASES, KNOWLEDGE_HUB_ENDPOINT, KNOWLEDGE_HUB_TOKEN.

Phases:
1. Create all GitHub labels for scope: and change: types including change:release and change:release-ff
2. Build and verify the CI label check workflow — test with a real PR opened and merged via GH CLI
3. Build the daily workflow and script — test by merging a PR with change:release and triggering manually
4. Build the weekly workflow and script — test by triggering manually and verifying Claude output
5. Build the monthly workflow and script — test by triggering manually and verifying Claude output
6. Write and apply final prompts for daily, weekly and monthly — re-verify outputs
7. Run a full end-to-end test with 3–5 test PRs covering different label combinations

For each phase: write the code, commit to a feature branch, open a PR via GH CLI, add appropriate labels, merge it, then run the verification step. Only move to the next phase when verification passes.
```