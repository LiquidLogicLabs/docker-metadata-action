## Upstream Sync Rules (docker/metadata-action)

This fork must track upstream features while remaining 100% GitHub-API free (git-only, offline-friendly). Upstream's engine (`src/meta.ts`, `src/tag.ts`, `src/flavor.ts`, `src/image.ts`) and its full test suite are vendored **verbatim** behind an anti-corruption shim in `src/shims/`. Follow the steps below for every sync.

### Guardrails
- Do **not** add `@actions/github` or `@docker/actions-toolkit`; keep `simple-git` for context.
- Derive context from git and workflow event payloads only (`GITHUB_EVENT_PATH`, `GITHUB_REF`, `GITHUB_SHA`).
- `base_ref`/PR metadata: use event payload when present; otherwise leave empty.
- Default branch: use git remote HEAD (`origin/HEAD` fallback to `main`/`master`).
- Keep outputs + env exports parity with upstream.
- The `github-token` input may exist for upstream compatibility, but it must remain unused (no GitHub API calls).
- Workflows are **patched, not mirrored**. This rule previously read "workflows must
  match upstream exactly; remove local workflow-only tweaks during sync", which
  directly contradicted the workflow-patching table in `CLAUDE.md` and the actual
  contents of `.github/workflows/`. The patching approach is what is really in use:
  upstream workflows that do not apply are disabled with a minimal `if` condition
  rather than deleted. Corrected 2026-09-05.
- When verifying `dist/index.js` is clean, grep for **package fingerprints** (not just URLs) — all must return 0 matches:
  ```bash
  grep -c "octokit\|Octokit\|rest\.repos\|rest\.git\|graphql\|@octokit" dist/index.js
  grep -c "actions-toolkit\|actions/github" dist/index.js
  grep -c "api\.github\.com" dist/index.js
  ```
  Always ignore `dist/*.map` — sourcemaps may embed these strings from dependency comments.

### Workflow

Syncs are performed by the `upstream-sync` workflow, or locally:

    yarn sync:upstream vX.Y.Z   # vendor the tag and update .upstream-sync.json
    yarn tsc --noEmit           # the tripwire: a missing shim field fails here
    yarn check:vendored         # vendored files still match upstream
    yarn test                   # includes upstream's vendored suite
    yarn build                  # then assert the three-grep invariant

Vendored files are **never hand-edited**, and there is no longer an exception
for this. `__tests__/meta.test.ts` — upstream's own suite, 4922 lines — is
vendored byte-for-byte in `.upstream-sync.json`'s `vendored` array, alongside
`src/meta.ts`, `src/tag.ts`, `src/flavor.ts` and `src/image.ts`. `yarn
check:vendored` byte-compares all five against the recorded upstream hashes,
so a sync is fully mechanical: it can no longer silently overwrite a hand-
applied edit, because there is no hand-applied edit to overwrite. `.upstream-
sync.json` still carries a `vendoredWithEdits` key for future use, but it is
empty — `scripts/check-vendored.mjs` never reads it either way, and
`scripts/vendor-upstream.mjs` treats it as an empty list when computing which
files to vendor.

Some assertions in that suite cannot pass in a fork that makes no GitHub API
calls (see `__tests__/vendored-exceptions.ts` for why, and its
`EXPECTED_EXCEPTION_COUNT` guard against silent growth). Rather than editing
the vendored test file to skip them, the exclusion is applied from
`vitest.config.ts` — a file that is never touched by a sync — which builds a
negative-lookahead `testNamePattern` from `EXCEPTIONS` (escaping regex
metacharacters in each title) when the list is non-empty. `EXCEPTIONS` is
currently empty, so nothing is filtered and all upstream tests run.

Releases are cut separately, through the `sync-release` workflow
(`workflow_dispatch`, taking the fork version to release): it re-runs
`check:vendored`, `test`, and `build`, asserts `dist/index.js` is unchanged by
that build, then tags and publishes the release. It also enforces the version
rule below — the release fails if the given version's MAJOR.MINOR does not
match the upstream tag recorded in `.upstream-sync.json`. Creating the release
fires a `release: published` event, which re-triggers `tag-release.yml` and
force-updates the floating `vX` tag a second time; this is harmless since both
workflows write the same SHA, but it means `vX` is written twice per release.

### Quick checklist
- [ ] Upstream tag vendored via `yarn sync:upstream vX.Y.Z`
- [ ] `yarn tsc --noEmit`, `yarn check:vendored`, `yarn test`, `yarn build` all pass
- [ ] If new upstream tests fail for the same API-free reason as an existing
      entry in `__tests__/vendored-exceptions.ts`, add the title there (never
      wildcard) and bump `EXPECTED_EXCEPTION_COUNT` — `vitest.config.ts` picks
      it up automatically, no test file edit needed
- [ ] Three-grep dist purity invariant is 0/0/0
- [ ] `.upstream-sync.json` reflects the new tag/commit
- [ ] Release cut via the `sync-release` workflow, not by hand

## Sync log

- **2026-04-21** — Verified alignment with upstream `v6.0.0`. Upstream is 16 commits ahead on `master` (all CI/CD only — zizmor, CodeQL, dependabot, workflow fixes; `git log HEAD..upstream/master -- src/ __tests__/` returns zero commits). Declined to rebase onto `master` to preserve the "version matches upstream exactly" convention. 3-grep invariant verified 0/0/0 on rebuilt `dist/index.js`. All 66 Vitest tests pass. Will re-sync when upstream publishes the next release tag (v6.0.1+ or v7).

- **2026-09-05** — Re-measured against upstream v6.2.0. Upstream is 148 commits ahead;
  `git log base..v6.2.0 -- src/ __tests__/` again returns **zero** commits, reproducing
  the April result. The 12 non-dependabot commits are build tooling and CI only.
  Coupling surface enumerated **by the compiler** (not grep) by building upstream's
  files against an empty shim: `Context` needs 5 members, `GitHubRepo` 5, and
  `ToolkitContext` exactly one (`tmpDir()`, `meta.ts:649`); `tag.ts`, `flavor.ts` and
  `image.ts` import nothing from the toolkit. A prior grep-derived estimate of 12
  context fields was wrong — it split nested `payload.*` paths.
  Two decisions taken: the version convention changes to mirror MAJOR.MINOR and own
  the PATCH (superseding the 2026-04-21 entry below), and the sync mechanism moves to
  verbatim vendoring behind a shim. Also found: `src/context.ts:80` defaults
  `bake-target` to `git-action-docker-metadata` where upstream uses
  `docker-metadata-action` — a live drop-in break, to be reverted.

- **2026-09-05 (Task 4 fix round 1)** — Reverted: `src/context.ts`'s `bake-target`
  default is back to `docker-metadata-action`, matching upstream and this fork's
  own unchanged `package.json` name / `action.yml` display name. `README.md` and
  this file's default-value example above are updated to match; both had been
  left documenting the wrong (`git-action-docker-metadata`) default.

- **2026-09-05 (mechanical sync)** — `__tests__/meta.test.ts` moved from
  `vendoredWithEdits` to `vendored`: its only divergence from upstream was a
  hand-added `VENDORED-EDIT` block importing `EXCEPTIONS` and defining
  `skipIfExcepted`, which had zero call sites (`EXCEPTIONS` was, and is,
  empty) and meant every sync overwrote the file and `check:vendored` never
  verified it — the one vendored artifact (4922 lines, upstream's own suite)
  nothing checked. The block is gone; the file is now byte-identical to
  upstream `dc802804100637a589fabce1cb79ff13a1411302` and hashed in
  `.upstream-sync.json` alongside the other four vendored files.
  `vitest.config.ts` now builds `test.testNamePattern` from
  `__tests__/vendored-exceptions.ts`'s `EXCEPTIONS` (regex-escaped, negative
  lookahead) when non-empty, so the exception mechanism lives in a file a
  sync never touches. `check:vendored` reports 5 files. A sync
  (`node scripts/vendor-upstream.mjs v6.2.0`) is now a true no-op against
  `__tests__/meta.test.ts` — previously it always produced a diff there.
