#!/usr/bin/env bash
# Creates all required PR labels in the current repo.
# Run once when setting up a new repo:
#   bash .github/scripts/create-labels.sh
#
# Requires: gh CLI authenticated with write access to the repo.

set -euo pipefail

REPO="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"
echo "Creating labels in $REPO"

create() {
  local name="$1" color="$2" description="$3"
  gh label create "$name" \
    --color "$color" \
    --description "$description" \
    --repo "$REPO" \
    --force          # update if it already exists
}

# Scope labels — blue
create "scope:fe"   "0075ca" "Frontend / UI"
create "scope:be"   "0075ca" "Backend / API / services"
create "scope:ml"   "0075ca" "ML / models / inference"
create "scope:data" "0075ca" "Data pipelines / ETL / analytics"

# Change type labels — yellow
create "change:feat"       "e4e669" "New feature or capability"
create "change:fix"        "e4e669" "Bug fix"
create "change:perf"       "e4e669" "Performance improvement"
create "change:breaking"   "e4e669" "Breaking change"
create "change:refactor"   "e4e669" "Internal restructure, no behaviour change"
create "change:chore"      "e4e669" "Tooling, deps, CI, config"
create "change:docs"       "e4e669" "Documentation only"

# Release labels — green / grey
create "change:release"    "0e8a16" "Include in daily release notes"
create "change:release-ff" "cfd3d7" "Internal fast-forward merge — excluded from release notes"

echo "Done."
