# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A fork of `docker/metadata-action` that removes all GitHub API dependencies, replacing them with direct git commands via `simple-git`. This makes the action work with any git host (GitHub, Gitea, GitLab, Bitbucket, self-hosted, etc.).

**Versioning (changed 2026-09-05):** the fork mirrors upstream's **MAJOR.MINOR** and
**owns the PATCH** — upstream 6.2.x becomes fork 6.2.N, with floating `v6` and `v6.2`
maintained so both stay drop-in. This replaces the former "same version number as
upstream" rule, which left no room to ship a fork-only fix between upstream releases.
Rationale and the rejected alternative are recorded in
[docs/superpowers/specs/2026-09-05-upstream-sync-design.md](docs/superpowers/specs/2026-09-05-upstream-sync-design.md).

## Commands

```bash
yarn build           # Bundle src/ → dist/index.js via ncc (commit dist/ after src/ changes)
yarn lint            # Run ESLint v9 flat config (max-warnings=0, prettier via plugin)
yarn format          # Auto-fix eslint/prettier issues
yarn test            # Run Vitest unit tests
yarn test:act:ci     # Run CI workflow locally via act (verifies no API deps end-to-end)
```

Run a single test file:
```bash
yarn test -- --reporter=verbose __tests__/meta.test.ts
```

Run tests with coverage:
```bash
yarn test -- --coverage
```

Run just the context job via act (fastest end-to-end check):
```bash
act push -W .github/workflows/ci.yml -j context --eventpath .github/workflows/.act/event-ci.json
```

## Architecture

**Entry point**: `dist/index.js` (bundled, committed) — the Actions runner executes this directly.

**Source flow** (`src/`):
1. `main.ts` — reads inputs, gets context, instantiates `Meta`, writes outputs via `@actions/core`
2. `context.ts` — parses action inputs (`getInputs()`) and extracts runtime context in two modes:
   - `"workflow"`: reads GitHub event payload from `GITHUB_EVENT_PATH`
   - `"git"`: calls git commands directly (the key fork addition)
3. `git.ts` — git wrapper using `simple-git`; provides `getGitContext()` and `parseRepoFromRemoteUrl()`
4. `meta.ts` — `Meta` class; core logic for generating version string, tags, labels, and annotations
5. `tag.ts` — tag type parsing and value generation (schedule, semver, pep440, match, edge, ref, raw, sha)
6. `flavor.ts` — prefix/suffix/latest transformations applied to tags
7. `image.ts` — Docker image name parsing and sanitization

**Tests** live in `__tests__/` with fixtures in `__tests__/fixtures/`. Coverage is collected from `src/**` excluding `main.ts`. The test environment sets `GITHUB_REPOSITORY`, `RUNNER_TEMP`, `RUNNER_TOOL_CACHE`, and `TEMP`.

## Critical Constraints

- **No GitHub API calls**: `@actions/github` and `@docker/actions-toolkit` have been removed. Never reintroduce them. After building, scan `dist/index.js` (not `dist/*.map`) for any of these strings — all should return 0 matches:
  ```bash
  grep -c "octokit\|Octokit\|rest\.repos\|rest\.git\|graphql\|@octokit" dist/index.js
  grep -c "actions-toolkit\|actions/github" dist/index.js
  grep -c "api\.github\.com" dist/index.js
  ```
- **dist/ must be committed**: After any `src/` change, run `yarn build` and commit the updated `dist/index.js` along with source changes.
- **`simple-git` import under `nodenext`**: Use the named export — `import {simpleGit} from 'simple-git'` — not the default import. The default import is not callable under `nodenext` module resolution and will cause a TypeScript/ncc build error.
- **Upstream sync discipline**: See `docs/UPSTREAM_SYNC_RULES.md` before merging upstream changes. Preserve git-only/offline behavior and document sync status clearly.

## Upstream Sync Process

This fork is rebased directly onto `upstream/master` so there is always exactly **one customization commit** on top of the upstream history. This keeps the "X commits behind" counter at 0 and makes future syncs trivial.

```bash
# 1. Fetch latest upstream
git fetch upstream

# 2. Rebase our single customization commit onto new upstream/master
git rebase upstream/master
# Resolve any conflicts (typically src/context.ts, src/meta.ts, package.json)
# Always take our version for: git.ts, removal of toolkit deps, our scripts
# Take upstream's version for: new features, bug fixes in meta/tag/flavor logic

# 3. Rebuild dist and verify no API deps crept in
yarn build
grep -c "octokit\|actions-toolkit\|api\.github\.com" dist/index.js  # must all be 0

# 4. Run tests
yarn test
act push -W .github/workflows/ci.yml -j context --eventpath .github/workflows/.act/event-ci.json

# 5. Force-push (history was rewritten)
git push origin master --force
```

## Workflow Patching

Upstream workflows that don't apply to this fork are disabled with a minimal `if` condition rather than deleted or heavily modified. This keeps the diff small and makes future syncs conflict-free.

| Workflow | Approach |
|---|---|
| `publish.yml` | `if: github.repository_owner == 'docker'` — disables Marketplace publishing |
| `validate.yml` | `if: github.repository_owner == 'docker'` — disables bake-based validation |
| `update-dist.yml` | `owner: ${{ github.repository_owner }}` — replaces hardcoded `docker` |
| `tag-release.yml` | Our file (new, never conflicts) — updates floating major tag on release |

When syncing upstream, check these four files for new conflicts. The `if` conditions require at most a 1-line re-add if upstream rewrites the job block.

## Release Process

> **Note:** the sync *mechanism* below is being replaced — see
> [the upstream-sync design](docs/superpowers/specs/2026-09-05-upstream-sync-design.md).
> Until that is implemented, the process below is still what is in use, except that
> the version number now follows the MAJOR.MINOR-mirror / own-the-PATCH rule above.

To release after a sync:

```bash
# 1. Update version in package.json and add CHANGELOG entry, then:
git add <all changed files>
git commit -m "feat: sync with upstream docker/metadata-action vX.Y.Z"

# 2. Force-push master (rebase rewrites history)
git push origin master --force

# 3. Delete old tags and release (locally and remotely)
git tag -d vX.Y.Z vX
git push origin :refs/tags/vX.Y.Z :refs/tags/vX
gh release delete vX.Y.Z --repo LiquidLogicLabs/git-action-docker-metadata --yes

# 4. Create new tags pointing to HEAD
git tag vX.Y.Z HEAD
git tag vX HEAD
git push origin vX.Y.Z vX

# 5. Create GitHub release
gh release create vX.Y.Z \
  --repo LiquidLogicLabs/git-action-docker-metadata \
  --title "vX.Y.Z — Sync with upstream docker/metadata-action vX.Y.Z" \
  --notes "..."
```

Note: the `release:patch/minor/major` npm scripts call `npm run package` internally which does not exist — do not use them. The `tag-release.yml` workflow automatically updates the floating major tag (`vX`) when a release is published.

## Cursor Rules

`.cursor/rules/action-best-practices.mdc` contains detailed standards for this action type — action.yml conventions (kebab-case inputs/outputs), ncc packaging, act-based testing, permissions, and security. Consult it when making structural changes.
