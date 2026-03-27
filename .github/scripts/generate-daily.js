/**
 * generate-daily.js
 *
 * Fetches all PRs merged since the last-daily-run git tag,
 * filters to those with the `change:release` label,
 * formats a structured daily release payload,
 * posts to Slack, creates a GitHub Release, and posts to Knowledge Hub.
 *
 * Environment variables required:
 *   GITHUB_TOKEN          - GitHub token (provided by Actions)
 *   GITHUB_REPOSITORY     - "owner/repo" (provided by Actions)
 *   SLACK_WEBHOOK_RELEASES - Slack incoming webhook URL
 *   KNOWLEDGE_HUB_ENDPOINT - REST endpoint for Knowledge Hub
 *   KNOWLEDGE_HUB_TOKEN    - Bearer token for Knowledge Hub
 */

import { Octokit } from '@octokit/rest';
import { IncomingWebhook } from '@slack/webhook';

const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getLastRunTimestamp() {
  try {
    const { data } = await octokit.git.getRef({
      owner,
      repo,
      ref: 'tags/last-daily-run',
    });
    const tagSha = data.object.sha;
    const tagType = data.object.type;

    // Lightweight tag → commit; annotated tag → tag object → commit
    if (tagType === 'tag') {
      const { data: tagObj } = await octokit.git.getTag({ owner, repo, tag_sha: tagSha });
      return new Date(tagObj.tagger.date);
    } else {
      const { data: commit } = await octokit.git.getCommit({ owner, repo, commit_sha: tagSha });
      return new Date(commit.committer.date);
    }
  } catch (err) {
    if (err.status === 404) {
      // First run — look back to start of previous business day.
      // Monday → Friday, otherwise → yesterday. Ensures weekend merges aren't lost.
      const now = new Date();
      const day = now.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
      const daysBack = day === 1 ? 3 : day === 0 ? 2 : 1;
      const since = new Date(now);
      since.setUTCDate(since.getUTCDate() - daysBack);
      since.setUTCHours(0, 0, 0, 0);
      console.log(`No last-daily-run tag found. Defaulting to start of ${daysBack === 1 ? 'yesterday' : 'Friday'}: ${since.toISOString()}`);
      return since;
    }
    throw err;
  }
}

async function getMergedPRsSince(since) {
  const prs = [];
  let page = 1;

  while (true) {
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 100,
      page,
    });

    if (data.length === 0) break;

    for (const pr of data) {
      if (!pr.merged_at) continue;
      const mergedAt = new Date(pr.merged_at);
      if (mergedAt <= since) {
        // PRs are sorted by updated_at desc; once we pass the window we can stop
        return prs;
      }
      prs.push(pr);
    }

    page++;
  }

  return prs;
}

function extractOutcomeSection(body) {
  if (!body) return null;
  // Look for a section like "## Outcome" or "## What changed" etc.
  const match = body.match(/##\s*(outcome|what changed|changes?|summary)[^\n]*\n([\s\S]*?)(?=\n##|\n---|\n\*\*|$)/i);
  return match ? match[2].trim() : null;
}

function formatScopeTag(labels) {
  const scopes = labels
    .filter(l => l.name.startsWith('scope:'))
    .map(l => l.name.replace('scope:', '').toUpperCase());
  return scopes.length ? `[${scopes.join('/')}]` : '';
}

async function updateLastRunTag(sha) {
  try {
    // Delete existing tag ref (ignore 422 if it doesn't exist)
    await octokit.git.deleteRef({ owner, repo, ref: 'tags/last-daily-run' }).catch(() => {});

    await octokit.git.createRef({
      owner,
      repo,
      ref: 'refs/tags/last-daily-run',
      sha,
    });
    console.log(`Updated last-daily-run tag to ${sha}`);
  } catch (err) {
    console.error('Failed to update last-daily-run tag:', err.message);
    throw err;
  }
}

async function getHeadSha() {
  const { data } = await octokit.repos.getBranch({ owner, repo, branch: 'main' });
  return data.commit.sha;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const since = await getLastRunTimestamp();
  console.log(`Fetching PRs merged since ${since.toISOString()}`);

  const allMerged = await getMergedPRsSince(since);
  const releasePRs = allMerged.filter(pr =>
    pr.labels.some(l => l.name === 'change:release' || l.name === 'change:release-ff')
  );

  console.log(`Found ${allMerged.length} merged PRs, ${releasePRs.length} with change:release or change:release-ff`);

  if (releasePRs.length === 0) {
    console.log('No release PRs found. Skipping notifications.');
    // Still update the tag so we don't re-scan old PRs
    const sha = await getHeadSha();
    await updateLastRunTag(sha);
    process.exit(0);
  }

  const _now = new Date();
  const today = `${String(_now.getUTCDate()).padStart(2,'0')}-${String(_now.getUTCMonth()+1).padStart(2,'0')}-${_now.getUTCFullYear()}`;

  // Build structured payload
  const items = releasePRs.map(pr => {
    const scope = formatScopeTag(pr.labels);
    const featureFlag = pr.labels.some(l => l.name === 'change:release-ff');
    const changeTypes = pr.labels
      .filter(l => l.name.startsWith('change:') && l.name !== 'change:release' && l.name !== 'change:release-ff')
      .map(l => l.name.replace('change:', ''));
    const outcome = extractOutcomeSection(pr.body);

    return {
      pr_number: pr.number,
      title: pr.title,
      url: pr.html_url,
      scope,
      change_types: changeTypes,
      feature_flag: featureFlag,
      merged_at: pr.merged_at,
      outcome,
      author: pr.user.login,
    };
  });

  const payload = {
    type: 'daily',
    date: today,
    pr_count: items.length,
    prs: items,
  };

  // Group items by scope label
  const SCOPE_ORDER = ['FE', 'BE', 'ML', 'DATA'];
  const grouped = {};
  for (const item of items) {
    const scopes = item.scope ? item.scope.replace(/[\[\]]/g, '').split('/') : ['OTHER'];
    for (const s of scopes) {
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push(item);
    }
  }
  const scopeKeys = [...SCOPE_ORDER.filter(s => grouped[s]), ...Object.keys(grouped).filter(s => !SCOPE_ORDER.includes(s))];

  // ---------------------------------------------------------------------------
  // 1. Post to Slack
  // ---------------------------------------------------------------------------
  if (process.env.SLACK_WEBHOOK_RELEASES) {
    const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_RELEASES);

    const scopeBlocks = scopeKeys.flatMap(scope => {
      const bullets = grouped[scope].map(item => {
        const ffTag = item.feature_flag ? ' 🚩 _feature flag_' : '';
        const line = `• <${item.url}|${item.title}>${ffTag}`;
        return item.outcome ? `${line}\n  _${item.outcome}_` : line;
      }).join('\n');
      return [
        { type: 'section', text: { type: 'mrkdwn', text: `*${scope}*\n${bullets}` } },
      ];
    });

    await webhook.send({
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Daily Release Notes — ${today}` },
        },
        ...scopeBlocks,
      ],
    });
    console.log('Posted to Slack');
  } else {
    console.warn('SLACK_WEBHOOK_RELEASES not set — skipping Slack');
  }

  // ---------------------------------------------------------------------------
  // 2. Create GitHub Release (used by weekly/monthly aggregation)
  // ---------------------------------------------------------------------------
  const releaseBody = scopeKeys.map(scope => {
    const bullets = grouped[scope].map(item => {
      const ffTag = item.feature_flag ? ' _(behind feature flag)_' : '';
      const desc = item.outcome ? `\n  ${item.outcome}` : '';
      return `- ${item.title}${ffTag}${desc}`;
    }).join('\n');
    return `### ${scope}\n${bullets}`;
  }).join('\n\n');

  const tagName = `daily-${today}`;
  const headSha = await getHeadSha();

  // Create tag ref (overwrite if exists)
  await octokit.git.createRef({
    owner, repo,
    ref: `refs/tags/${tagName}`,
    sha: headSha,
  }).catch(async (err) => {
    if (err.status === 422) {
      // Tag already exists — update it
      await octokit.git.updateRef({
        owner, repo,
        ref: `tags/${tagName}`,
        sha: headSha,
        force: true,
      });
    } else throw err;
  });

  // Delete existing release with same tag if any
  const existingReleases = await octokit.repos.listReleases({ owner, repo, per_page: 10 });
  const existing = existingReleases.data.find(r => r.tag_name === tagName);
  if (existing) {
    await octokit.repos.deleteRelease({ owner, repo, release_id: existing.id });
  }

  const { data: release } = await octokit.repos.createRelease({
    owner,
    repo,
    tag_name: tagName,
    name: `Daily Release Notes — ${today}`,
    body: releaseBody,
    prerelease: true,
  });
  console.log(`Created GitHub Release: ${release.html_url}`);

  // ---------------------------------------------------------------------------
  // 3. Post to Knowledge Hub
  // ---------------------------------------------------------------------------
  if (process.env.KNOWLEDGE_HUB_ENDPOINT && process.env.KNOWLEDGE_HUB_TOKEN) {
    const res = await fetch(process.env.KNOWLEDGE_HUB_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.KNOWLEDGE_HUB_TOKEN}`,
      },
      body: JSON.stringify({
        type: 'daily',
        date: today,
        content: releaseBody,
        prs: items,
        release_url: release.html_url,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Knowledge Hub POST failed: ${res.status} ${text}`);
    } else {
      console.log('Posted to Knowledge Hub');
    }
  } else {
    console.warn('KNOWLEDGE_HUB_ENDPOINT or KNOWLEDGE_HUB_TOKEN not set — skipping Knowledge Hub');
  }

  // ---------------------------------------------------------------------------
  // 4. Update last-daily-run tag
  // ---------------------------------------------------------------------------
  await updateLastRunTag(headSha);

  console.log(`Done. Daily release for ${today} complete.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
