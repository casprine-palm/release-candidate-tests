# Questions for Review

## Assumptions I'm making (correct these if wrong)

### Repository
- Using `casprine-palm/release-candidate-tests` as the target repo
- Default branch will be `main`

### Slack
- Assuming `SLACK_WEBHOOK_RELEASES` secret posts to a single Slack channel for all (daily/weekly/monthly)
- If you want separate channels per release type, let me know the secret names

### Knowledge Hub
- `KNOWLEDGE_HUB_ENDPOINT` — I'm assuming a REST endpoint that accepts a POST with JSON body
- `KNOWLEDGE_HUB_TOKEN` — Bearer token for auth
- I don't know the expected payload schema. I'm using: `{ type, date, content, prs }`
- If the endpoint has a specific schema, update `.github/scripts/knowledge-hub.js`

### Claude API (weekly/monthly)
- Using `claude-sonnet-4-6` model for weekly/monthly summaries
- Prompts are in `prompts/` directory — you should review and adjust tone/length

### Daily workflow
- Runs Mon–Fri at 07:00 UTC
- Skips if no `change:release` PRs merged since last run
- Uses a git tag `last-daily-run` to track the last run timestamp

### Weekly workflow
- Runs every Friday at 07:00 UTC
- Aggregates the week's GitHub releases (daily release notes) and sends to Claude

### Monthly workflow
- Runs first Monday of each month at 07:00 UTC

### Fast-forward label (`change:release-ff`)
- These are excluded from customer-facing weekly/monthly marketing copy
- They ARE included in the daily technical notes

### PR label check
- A PR must have at least one `scope:` label AND at least one `change:` label
- `change:release` and `change:release-ff` cannot both be on the same PR

## Open questions

1. **Knowledge Hub schema** — What does the Knowledge Hub endpoint expect? POST body format?
2. **Slack formatting** — Do you want Block Kit (rich formatting) or plain text? I'm using Block Kit.
3. **Separate Slack channels** — Same channel for daily/weekly/monthly, or different?
4. **Git tag vs DB for tracking** — Using a git tag (`last-daily-run`) to track last daily run. Is there a preferred way to track this?
5. **Daily release format** — I'm creating a GitHub Release for each daily run (used by weekly/monthly scripts to aggregate). Is this OK or should it just post to Slack?
6. **Test PRs** — Phase 7 creates test PRs with dummy content. These will be merged into `main`. OK to leave them in history?
7. **Node.js version** — Using Node 20 in GitHub Actions. OK?
8. **`change:release-ff` meaning** — I'm treating "ff" as "fast-forward" (internal/infra changes not customer-visible). Correct?
