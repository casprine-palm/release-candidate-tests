# Setup Guide — Release Notes Pipeline

This document is a complete, step-by-step implementation guide. It is intended to be handed to an agent or engineer setting up this pipeline in a new monorepo from scratch.

---

## What you are setting up

A fully automated release notes pipeline that:
- Validates every PR has the right labels and a filled Outcome section
- Runs a daily job (Mon–Fri 07:00 UTC) that collects merged PRs tagged `change:release`, groups them by scope, posts a structured digest to Slack, and saves a GitHub Pre-release as a data store
- Runs a weekly job (Friday 07:00 UTC) that aggregates the week's daily releases, passes them to the Claude API for a customer-facing summary, posts to Slack, and saves a GitHub Release
- Runs a monthly job (first Monday 07:00 UTC) that aggregates the last 4 weekly releases through Claude for a marketing-ready update and posts to Slack

---

## Files to copy into the target repo

Copy the following files exactly as-is from this repo. Paths are relative to the repo root.

```
.github/
  pull_request_template.md
  workflows/
    pr-label-check.yml
    release-daily.yml
    release-weekly.yml
    release-monthly.yml
    release-weekly-backfill.yml   ← keep for operational use
  scripts/
    generate-daily.js
    generate-weekly.js
    generate-monthly.js
    generate-weekly-backfill.js
    package.json
    package-lock.json
prompts/
  weekly-marketing.md
  monthly-marketing.md
```

Do not copy `README.md` or `SETUP.md` — the target repo has its own.

---

## Step 1 — Create GitHub labels

Create all of the following labels in the target repo. Use `gh label create` or the GitHub UI.

**Scope labels** (colour suggestion: `#0075ca` blue):
```
scope:fe
scope:be
scope:ml
scope:data
```

**Change type labels** (colour suggestion: `#e4e669` yellow):
```
change:feat
change:fix
change:perf
change:breaking
change:refactor
change:chore
change:docs
change:release
change:release-ff
```

Using `gh`:
```bash
for label in scope:fe scope:be scope:ml scope:data; do
  gh label create "$label" --color 0075ca --repo OWNER/REPO
done

for label in change:feat change:fix change:perf change:breaking change:refactor change:chore change:docs change:release change:release-ff; do
  gh label create "$label" --color e4e669 --repo OWNER/REPO
done
```

---

## Step 2 — Add GitHub secrets

Go to **Settings → Secrets and variables → Actions** in the target repo and add:

| Secret name | Where to get it |
|---|---|
| `SLACK_WEBHOOK_RELEASES` | Create an incoming webhook in your Slack workspace: Slack App → Incoming Webhooks → Add New Webhook. Point it at the channel where release notes should be posted. |
| `ANTHROPIC_API_KEY` | From console.anthropic.com → API Keys. Needed for weekly and monthly Claude summaries. |
| `KNOWLEDGE_HUB_ENDPOINT` | Optional. If you have an internal knowledge base REST API, provide the POST endpoint URL here. |
| `KNOWLEDGE_HUB_TOKEN` | Optional. Bearer token for the Knowledge Hub endpoint above. |

`GITHUB_TOKEN` is provided automatically by Actions — no setup needed.

---

## Step 3 — Configure branch protection

Enable branch protection on `main` with the following settings:

```bash
gh api repos/OWNER/REPO/rulesets \
  --method POST \
  --input - << 'EOF'
{
  "name": "main branch protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": {
      "include": ["refs/heads/main"],
      "exclude": []
    }
  },
  "rules": [
    { "type": "pull_request" },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "Verify PR labels" }
        ]
      }
    }
  ]
}
EOF
```

This ensures every PR has passing label checks before it can be merged.

---

## Step 4 — Customise the scripts for the target repo

### 4a — Scopes

The pipeline currently uses `FE`, `BE`, `ML`, `DATA`. If the target monorepo has different services, update two places:

**In `.github/scripts/generate-daily.js`**, find `SCOPE_ORDER`:
```js
const SCOPE_ORDER = ['FE', 'BE', 'ML', 'DATA'];
```
Replace with the target repo's scope names in the order you want them to appear.

**In `.github/workflows/pr-label-check.yml`**, update the error message for missing scope labels to list the correct `scope:*` labels.

**In `.github/pull_request_template.md`** — no changes needed, it's generic.

### 4b — Product name in Claude prompts

In `prompts/weekly-marketing.md` and `prompts/monthly-marketing.md`, the prompts are generic. The weekly prompt instructs Claude to use short noun-phrase headings with no product name branding. If you want Claude to include your product name in the output, add a line to each prompt like:

```
- The product is called "{YOUR PRODUCT NAME}" — use this name naturally in the copy
```

### 4c — Slack channel

The Slack webhook is tied to a specific channel when created. To change where messages go, create a new webhook pointing at the desired channel and update the `SLACK_WEBHOOK_RELEASES` secret.

### 4d — Schedule times

All three workflow files have cron schedules at the top. Adjust to match your team's timezone or preferred cadence:

- `release-daily.yml`: `'0 7 * * 1-5'` → Mon–Fri 07:00 UTC
- `release-weekly.yml`: `'0 7 * * 5'` → Friday 07:00 UTC
- `release-monthly.yml`: `'0 7 1-7 * 1'` → First Monday of month 07:00 UTC

---

## Step 5 — Verify the PR label check

Open a test PR in the target repo. Try merging without labels — it should fail with a comment explaining what's missing. Add all required labels and fill in the `## Outcome` section, then confirm the check passes and the comment is removed.

---

## Step 6 — First daily run

The first time the daily workflow runs with no `last-daily-run` tag present, it will automatically look back to the **start of the previous business day** (or Friday's start if run on a Monday), ensuring no merged PRs are missed on active repos.

To trigger it manually for the first time:
```bash
gh workflow run release-daily.yml --repo OWNER/REPO
```

Watch the run:
```bash
gh run watch --repo OWNER/REPO
```

After a successful run you will see:
- A Slack message in your releases channel
- A GitHub Pre-release tagged `daily-DD-MM-YYYY`
- The `last-daily-run` tag updated to current HEAD

---

## Step 7 — Backfilling past weeks (if the repo has history)

If the target repo has months of merged PRs and you want to retroactively generate weekly and monthly summaries before going live, use the backfill workflow:

```bash
# Example: backfill the week ending 14 March 2026
gh workflow run release-weekly-backfill.yml \
  --repo OWNER/REPO \
  --field week_ending="14-03-2026" \
  --field daily_tags="daily-10-03-2026 daily-11-03-2026 daily-12-03-2026 daily-13-03-2026 daily-14-03-2026"
```

This requires daily GitHub Releases to already exist for those dates. If they don't (because the daily workflow wasn't running yet), you'll need to create them first by running the daily workflow manually for each day after setting the `last-daily-run` tag to the appropriate anchor point.

---

## Operational runbook

### A daily run finds no release PRs
Expected behaviour. The workflow logs `No release PRs found. Skipping notifications.` and updates the `last-daily-run` tag. No Slack message is sent — this is intentional.

### Re-running a daily that was missed
Move the `last-daily-run` tag back to before the missed window, then dispatch the workflow:
```bash
# Point last-daily-run at a commit from before the missed window
OLDER_SHA=$(gh api repos/OWNER/REPO/commits?until=2026-03-14T07:00:00Z --jq '.[0].sha')
gh api -X DELETE repos/OWNER/REPO/git/refs/tags/last-daily-run
gh api -X POST repos/OWNER/REPO/git/refs \
  -f ref=refs/tags/last-daily-run \
  -f sha=$OLDER_SHA

gh workflow run release-daily.yml --repo OWNER/REPO
```

### Triggering weekly / monthly on demand
```bash
gh workflow run release-weekly.yml --repo OWNER/REPO
gh workflow run release-monthly.yml --repo OWNER/REPO
```

### Knowledge Hub integration
If `KNOWLEDGE_HUB_ENDPOINT` and `KNOWLEDGE_HUB_TOKEN` are set, the daily script will POST the following JSON payload to that endpoint after each run:
```json
{
  "type": "daily",
  "date": "DD-MM-YYYY",
  "content": "<markdown release body>",
  "prs": [{ "pr_number": 42, "title": "...", "scope": "BE", "change_types": ["feat"], "outcome": "...", "author": "...", "merged_at": "...", "url": "..." }],
  "release_url": "https://github.com/..."
}
```

---

## File reference

| File | Purpose |
|---|---|
| `.github/pull_request_template.md` | Default PR body with required sections |
| `.github/workflows/pr-label-check.yml` | CI check — validates labels and Outcome on every PR |
| `.github/workflows/release-daily.yml` | Daily cron — triggers `generate-daily.js` |
| `.github/workflows/release-weekly.yml` | Weekly cron — triggers `generate-weekly.js` |
| `.github/workflows/release-monthly.yml` | Monthly cron — triggers `generate-monthly.js` |
| `.github/workflows/release-weekly-backfill.yml` | Manual dispatch — backfill a past week |
| `.github/scripts/generate-daily.js` | Fetches release PRs, posts to Slack, creates GitHub Release, posts to Knowledge Hub |
| `.github/scripts/generate-weekly.js` | Aggregates daily releases, calls Claude, posts to Slack, creates GitHub Release |
| `.github/scripts/generate-monthly.js` | Aggregates last 4 weekly releases, calls Claude, posts to Slack |
| `.github/scripts/generate-weekly-backfill.js` | Same as weekly but targets specific daily release tags |
| `.github/scripts/package.json` | Node dependencies: `@octokit/rest`, `@slack/webhook`, `@anthropic-ai/sdk` |
| `prompts/weekly-marketing.md` | System prompt for Claude weekly summaries |
| `prompts/monthly-marketing.md` | System prompt for Claude monthly summaries |
