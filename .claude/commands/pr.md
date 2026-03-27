Help the engineer create a well-formed pull request for their current branch. Follow these steps exactly.

## Step 1 — Understand the changes

Run these commands to gather context:
- `git diff main...HEAD --stat` — which files changed and how many lines
- `git log main...HEAD --oneline` — commit messages on this branch
- `git diff main...HEAD` — full diff (read carefully to understand what actually changed)

## Step 2 — Determine scope labels

Map changed file paths to scope labels. Use the repo's actual directory structure — look at the diff to figure out what area each file belongs to. Common mappings (adapt to this repo):

- Frontend / UI code → `scope:fe`
- Backend / API / server code → `scope:be`
- ML / model / inference code → `scope:ml`
- Data / pipelines / ETL / analytics → `scope:data`

A PR can have multiple scope labels if it touches more than one area.

## Step 3 — Determine change type labels

Pick the most accurate one (and add `change:release` if this change is customer-facing or system-impacting and should appear in release notes):

| Label | When to use |
|---|---|
| `change:feat` | New capability or behaviour |
| `change:fix` | Corrects a bug or incorrect behaviour |
| `change:perf` | Measurable performance improvement |
| `change:breaking` | Changes an existing API or contract in a non-backwards-compatible way |
| `change:refactor` | Internal restructure, no behaviour change |
| `change:chore` | Tooling, dependencies, CI, config |
| `change:docs` | Documentation only |
| `change:release` | Add this alongside any other label when the change should appear in daily release notes |
| `change:release-ff` | Released behind a feature flag — appears in release notes marked as early access |

## Step 4 — Draft the PR fields

Write all four sections:

**Title**: `<type>: <short imperative description>` — e.g. `feat: add cursor-paginated transaction export` or `fix: prevent duplicate webhook deliveries on retry`. If breaking, prefix with `feat!:` or `fix!:`.

**Summary** (1–2 sentences): What does this PR do? Focus on the what, not the how.

**Outcome** (required — this feeds directly into release notes): What is the user-facing or system impact? Be specific. Good: "Forecast exports now include a currency filter, reducing payload size by up to 80% for multi-currency accounts." Bad: "Updated the export function."

**Steps to test**: Concrete, numbered steps a reviewer can follow to verify the change works. At least 2 steps.

**Media**: Ask the engineer if there is a screenshot, recording, or diagram. If none and no UI changed, write `N/A — no UI change`.

## Step 5 — Show a preview and confirm

Present the complete PR body in a code block so the engineer can review it. Show the labels you will apply. Ask: "Does this look right, or would you like to adjust anything before I create the PR?"

## Step 6 — Create the PR

Once confirmed, run:
```
gh pr create \
  --title "<title>" \
  --body "<full body>" \
  --label "<label1>" --label "<label2>" ...
```

If the PR is a draft, add `--draft`.

After creating, output the PR URL.

## Rules

- Never skip the Outcome section — it is required by CI and feeds directly into the daily release notes that go to Slack
- If the diff is ambiguous about customer impact, ask the engineer to clarify before writing the Outcome
- Do not invent behaviour that isn't in the diff
- If the branch has no commits beyond main, say so and stop
