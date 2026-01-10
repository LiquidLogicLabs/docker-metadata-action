## Upstream Sync Rules (docker/metadata-action v5.x)

This fork must track upstream features while remaining 100% GitHub-API free (git-only, offline-friendly). Follow these steps for every sync.

### Guardrails
- Do **not** add `@actions/github` or `@docker/actions-toolkit`; keep `simple-git` for context.
- Derive context from git and workflow event payloads only (`GITHUB_EVENT_PATH`, `GITHUB_REF`, `GITHUB_SHA`).
- `base_ref`/PR metadata: use event payload when present; otherwise leave empty.
- Default branch: use git remote HEAD (`origin/HEAD` fallback to `main`/`master`).
- Keep outputs + env exports parity with upstream.

### Workflow
1. Fetch upstream tag to mirror (e.g., `v5.10.0`) and diff `action.yml`, `src/`, `__tests__/`, docs.
2. Map changes: replace any GitHub API usage with git/event-payload equivalents or document omissions.
3. Update context handling to support new upstream expressions/inputs without adding API calls.
4. Update `package.json` version to the upstream tag and refresh README sync note.
5. Regenerate `dist/` via `yarn install && yarn build` (or repo-standard build) and commit `dist/`.
6. Run `yarn lint`, `yarn test`, and `yarn build`; fix regressions before tagging.
7. Note any intentional deviations (API-only features) in README.

### Quick checklist
- [ ] Upstream tag diffed and reconciled
- [ ] Git-only context preserved (no new API deps)
- [ ] Version bumped to upstream tag
- [ ] README sync status updated
- [ ] dist rebuilt
- [ ] Lint/test/build pass
