# Reproducible Upstream Sync — Design

**Date:** 2026-09-05
**Repo:** `git-action-docker-metadata` (fork of `docker/metadata-action`)
**Status:** approved for planning

## Goal

Make syncing with upstream a mechanical, automatable operation instead of a
hand-done rebase, without giving up the property that makes this fork exist:
the action must run with **no GitHub API dependency**, under `act` and on Gitea.

Success: when upstream publishes a release, a scheduled job produces a green,
merged, released sync with no human involvement — and when it cannot, it fails
loudly and hands a human a precise, small problem.

## This repo is deliberately different

It follows **upstream's** conventions, not the sibling repos': Vitest not Jest,
`@actions/core@^3`, `type: module`/nodenext, yarn 4 not npm. Divergence from the
other 16 repos is a design choice. Judge changes here against upstream and the
run-anywhere goal, never against monorepo convention.

## Constraint: drop-in replacement

`uses: LiquidLogicLabs/git-action-docker-metadata@v6` must be substitutable for
`uses: docker/metadata-action@v6` in a workflow, assuming no SHA pin. Input
names, output names and default behaviour must match upstream.

## Verified facts (measured, not assumed)

Measured 2026-09-05 against base commit `1107934` (upstream v6.0.0 + 14).

- Upstream is **148 commits ahead** (v6.2.0). `git log base..v6.2.0 -- src/ __tests__/`
  returns **0 commits**. There are no upstream source fixes to merge; the delta is
  dependencies, build tooling and CI only.
- The vendored engine's coupling surface, **enumerated by the TypeScript compiler**
  (not by grep) by compiling upstream's files against a deliberately empty shim:
  - `Context`: `ref`, `sha`, `commitDate`, `eventName`, `payload` — and `Context`
    is declared in upstream's own `src/context.ts`, a file we already own and
    replace. No aliasing is required for it.
  - `GitHubRepo`: `name`, `description`, `html_url`, `license`, `default_branch`
  - `ToolkitContext`: **one** member, `tmpDir()`, at `meta.ts:649`.
  - `tag.ts`, `flavor.ts`, `image.ts` import nothing from the toolkit.
- An earlier grep-derived estimate of "12 context fields" was **wrong** — it split
  nested `payload.*` paths into separate fields. The compiler-derived set above is
  authoritative. Any future re-derivation must use the compiler for the same reason.
- Baseline: 66 tests / 5 files pass; `npm audit` clean.

## Architecture: an anti-corruption layer

The current fork **edits upstream's code** so it stops asking for GitHub-shaped
data. This design inverts that: leave upstream's code untouched and **supply**
the shape from git and the event file. The dependency being removed is on the
GitHub *API*, not on the *shape*.

Three tiers by ownership:

1. **Vendored verbatim** — `meta.ts`, `tag.ts`, `flavor.ts`, `image.ts` and
   `__tests__/`. Byte-identical to the synced upstream tag. This is a checkable
   property, enforced in CI, not a convention.
2. **Ours, permanent** — `context.ts` (declares `Context`, builds it from git +
   event file), `git.ts` (simple-git), `main.ts`, and a shim supplying
   `GitHubRepo` and `tmpDir()`.
3. **The seam** — `tsconfig` `paths` plus a matching bundler alias redirect
   `@docker/actions-toolkit/lib/context.js` and
   `@docker/actions-toolkit/lib/types/github/github.js` to the shim. Upstream's
   files import exactly what they always imported; resolution points elsewhere.
   Upstream needs no knowledge of this and no cooperation.

`tmpDir()` resolves to `RUNNER_TEMP` when set, else `os.tmpdir()` — both defined
under act and Gitea.

## Sync mechanics

Four steps, no judgment in any of them:

1. Copy the vendored file set from the upstream tag, verbatim.
2. **Typecheck — the tripwire.** If upstream reads a field the shim lacks,
   compilation fails. The failure is loud and immediate rather than a silent
   behavioural drift, and the compiler names exactly what is missing.
3. Run the vendored upstream suite against the shim, minus an explicit exception
   list (below).
4. Golden-output parity: run the action over fixture repos before and after, and
   diff emitted tags, labels and annotations.
5. The inherited three-grep dist purity invariant (see below) must return 0/0/0.

Also fix local tag shadowing, which is a developer-ergonomics bug only: the fork's
`v6`/`v6.0.0` tags shadow upstream's in a clone with both remotes, which is why
`git describe` reports `v5-56-g1107934`. Set the upstream remote refspec to
`+refs/tags/*:refs/upstream-tags/*`. Consumers see nothing; drop-in is unaffected.

## The exception list

Upstream asserts `org.opencontainers.image.description` and `.licenses` values
that come from the GitHub API. This fork emits empty strings for both
(`git.ts:112-113`). Those assertions cannot pass and must be excepted.

The exception list is **enumerated case by case** and asserted to be small. A
wildcard skip is forbidden: it would become the place failures hide, which is the
false-green failure mode — a suite reporting success while checking nothing. CI
asserts the list's length against a committed expected count, so silently growing
it fails.

## The agent

Trigger: a scheduled poll of upstream's releases API. Without upstream
cooperation this is the only available mechanism. Daily is sufficient — upstream
produced two releases across the 148-commit range.

The split of responsibility is deliberate:

- **The happy path is deterministic automation, not a model.** Copy, typecheck,
  test, diff, merge, release. Every step has a mechanical pass/fail. Introducing
  a model here would add nondeterminism to a problem that has a correct answer.
- **The failure path is agent-assisted.** When the typecheck trips because
  upstream reads a new field, that needs judgment: read what upstream added,
  propose the shim extension, explain it. Its output is always a pull request,
  never a merge.

Operational requirements:
- **Idempotent.** Keyed on the upstream tag; a failing sync updates its existing
  branch and PR rather than opening a new one nightly.
- **Single-flight.** Concurrency group prevents two runs racing the same branch.
- Merge and release only when every gate is green; otherwise stop at a PR.

## Version scheme — RESOLVED 2026-09-05: option (b)

`docs/UPSTREAM_SYNC_RULES.md` recorded, on 2026-04-21: *"Declined to rebase onto
`master` to preserve the 'version matches upstream exactly' convention."*
`CLAUDE.md` stated the same rule. This design proposed changing it, and that
prior decision was re-surfaced to the user explicitly before confirmation.

**Decision: adopt (b). The user approved the change knowingly, and approved
updating `CLAUDE.md` to match.** The superseded rule must be removed from both
documents, not left to contradict this one.

Rejected: **(a) keep mirroring exactly.** Fork vX.Y.Z == upstream vX.Y.Z is
simpler to reason about, but leaves no room to ship a fork-only fix between
upstream releases without inventing a number upstream may later reuse, or
waiting for upstream. The fork now carries fork-only fixes (the `bake-target`
revert below is one), so this cost is real rather than hypothetical.

**Adopted: mirror MAJOR.MINOR, own the PATCH.** Upstream 6.2.x becomes fork
6.2.N (ours), with floating `v6` and `v6.2` maintained so `@v6` and `@v6.2` stay
drop-in.

Prerelease suffixes (`v6.2.0-lll.1`) are rejected: they sort *before* `v6.2.0`,
which inverts the real ordering.

Under (b), the accepted cost: our `6.2.3` and a hypothetical upstream `6.2.3` are different
content. This has no technical effect, since consumers only resolve tags in this
repo, but it is ambiguous to a reader. Mitigated by recording the synced upstream
tag and commit in `.upstream-sync.json` and in the release notes, so "which
upstream am I on" has a precise answer.

## Relationship to existing documentation

This design supersedes the *mechanism* in `docs/UPSTREAM_SYNC_RULES.md` while
keeping all of its guardrails. That document must be updated, not left to
contradict this one.

Two existing contradictions were found and must be resolved as part of the work:

1. `UPSTREAM_SYNC_RULES.md` says *"Workflows must match upstream exactly; remove
   local workflow-only tweaks during sync."* `CLAUDE.md` documents the opposite:
   a workflow-patching table that disables `publish.yml` and `validate.yml` via
   `if: github.repository_owner == 'docker'`. Both cannot hold. The patching
   approach is the one actually in the repo, so the rule text is what is wrong.
2. `CLAUDE.md` notes the `release:patch/minor/major` scripts call a
   `npm run package` target that does not exist and must not be used. That is a
   latent trap for any release automation this design adds.

## The dist purity invariant (inherited, and load-bearing)

`UPSTREAM_SYNC_RULES.md` defines a three-grep invariant on the built bundle,
which all must return 0:

    grep -c "octokit\|Octokit\|rest\.repos\|rest\.git\|graphql\|@octokit" dist/index.js
    grep -c "actions-toolkit\|actions/github" dist/index.js
    grep -c "api\.github\.com" dist/index.js

This is the strongest existing guarantee that the fork's core property holds, and
it stays a required gate.

**It interacts directly with this design and must be verified early.** The
vendored upstream sources will still contain the literal text
`from '@docker/actions-toolkit/...'`, and the alias only redirects where that
specifier *resolves*. Bundlers normally inline the resolved module and drop the
specifier, so the invariant should still hold — but that is an assumption about
bundler output, not a fact, and this design would be the first thing to break it.
Verify it against a real build in the first implementation task. Note the
existing rule that `dist/*.map` is always excluded from these greps.

## Compatibility fixes required by the drop-in constraint

- **`bake-target` default is a live drop-in break.** `src/context.ts:80` defaults
  it to `git-action-docker-metadata`; upstream defaults to `docker-metadata-action`.
  Anyone swapping the action and using bake output without setting `bake-target`
  gets a different target name and their bake file stops matching. Revert to
  upstream's default; note it in release notes as a behaviour change.
- **`description`/`licenses` stay empty**, documented as a known limitation.
  Inventing a fork-specific source (parsing `LICENSE`, reading `package.json`)
  buys two label values at the cost of the divergence this design exists to
  remove. Revisit only if those labels are actually consumed.

## Also worth taking from upstream

Independent of sync, upstream's `.yarnrc.yml` now carries three supply-chain
protections this fork lacks: `enableHardenedMode: true`, `enableScripts: false`,
`npmMinimalAgeGate: 2d`. These are worth adopting on their own merits.

## Non-goals

- Changing where the repo is hosted. It stays on GitHub; `publish.yml`,
  Marketplace publishing and `codeql.yml` are correct and stay. Only the action
  **at runtime** must avoid GitHub APIs.
- Adopting monorepo conventions from the sibling repos.
- Migrating ncc → esbuild. Upstream did; it is optional here and independent.

## Risks

- **The vendored suite may not compile against our `Context`** even with the
  shim, because upstream's tests construct contexts directly. Mitigation: this is
  discovered in the first implementation task, and its outcome decides whether
  the suite is vendored whole or in part. This is the single largest unknown.
- **Upstream may restructure its module layout**, breaking the alias rather than
  a field. The typecheck still catches it; repair is larger than adding a field.
- **Empty `description`/`licenses`** remains a real behavioural difference from
  upstream for any consumer depending on those labels.
