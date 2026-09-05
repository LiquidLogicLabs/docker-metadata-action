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
- **Vendored files are never hand-edited.** `src/meta.ts`, `src/tag.ts`,
  `src/flavor.ts` and `src/image.ts` are upstream's files. `yarn check:vendored`
  fails if they drift. Extend `src/shims/` instead.

## Upstream Sync Process

Upstream's engine (`src/meta.ts`, `src/tag.ts`, `src/flavor.ts`, `src/image.ts`) and its
full test suite are vendored **verbatim** behind an anti-corruption shim in `src/shims/`.
See [docs/UPSTREAM_SYNC_RULES.md](docs/UPSTREAM_SYNC_RULES.md) for the full guardrails and
sync log; the commands are:

```bash
yarn sync:upstream vX.Y.Z   # vendor the tag and update .upstream-sync.json
yarn tsc --noEmit           # the tripwire: a missing shim field fails here
yarn check:vendored         # vendored files still match upstream
yarn test                   # includes upstream's vendored suite
yarn build                  # then assert the three-grep invariant
```

Releases are cut through the `sync-release` workflow, not by hand — see Release Process below.

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

Releases are cut through the `sync-release` workflow (`workflow_dispatch`, input: the fork
version to release, e.g. `6.2.1`) — never by hand-tagging. It:

1. Validates the given version's MAJOR.MINOR matches the upstream tag recorded in
   `.upstream-sync.json` (mirror-MAJOR.MINOR / own-the-PATCH — see the versioning note
   above; there is no prerelease-suffix path).
2. Runs `yarn install --immutable`, `yarn check:vendored`, `yarn test`, `yarn build`.
3. Asserts `dist/index.js` is unchanged by that build (`git diff --exit-code dist/index.js`).
4. Tags `vX.Y.Z` and force-updates the floating `vX` and `vX.Y` tags, then creates the
   GitHub release.

There are no direct `release:patch`/`release:minor`/`release:major` npm scripts — they were
removed because they bypassed every one of the gates above and produced prerelease
version numbers. Cutting a release means dispatching `sync-release.yml`.

## Cursor Rules

`.cursor/rules/action-best-practices.mdc` contains detailed standards for this action type — action.yml conventions (kebab-case inputs/outputs), ncc packaging, act-based testing, permissions, and security. Consult it when making structural changes.
