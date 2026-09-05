## Upstream Sync Rules (docker/metadata-action)

> **The mechanism in this document is being replaced.** See
> [the upstream-sync design](superpowers/specs/2026-09-05-upstream-sync-design.md),
> approved 2026-09-05. The **guardrails below still apply in full** — in
> particular the three-grep `dist` purity invariant, which becomes a required
> gate in the new process. What changes is *how* the sync is performed: vendoring
> upstream's engine verbatim behind a shim, rather than hand-reconciling edits.
>
> The former heading said "v5.x"; the fork has been on the v6 line since
> 2026-04-21.

This fork must track upstream features while remaining 100% GitHub-API free (git-only, offline-friendly). Follow these steps for every sync.

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
1. Fetch the latest upstream tag to mirror (e.g., `v5.10.0` or newer) and diff `action.yml`, `src/`, `__tests__/`, docs. Source: https://github.com/docker/metadata-action
2. Map changes: replace any GitHub API usage with git/event-payload equivalents or document omissions.
3. Update context handling to support new upstream expressions/inputs without adding API calls.
4. Refresh README sync note to record the upstream tag being mirrored; bump `package.json` only if you are publishing a fork release.
5. Regenerate `dist/` via `yarn install && yarn build` (or repo-standard build) and commit `dist/`.
6. Run `yarn lint`, `yarn test`, and `yarn build`; fix regressions before tagging.
7. Note any intentional deviations (API-only features) in README.

### Quick checklist
- [ ] Upstream tag diffed and reconciled
- [ ] Git-only context preserved (no new API deps)
- [ ] README sync status reflects upstream tag
- [ ] README sync status updated
- [ ] workflows match upstream
- [ ] dist rebuilt
- [ ] Lint/test/build pass

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
