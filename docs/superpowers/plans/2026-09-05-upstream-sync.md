# Upstream Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make syncing with upstream `docker/metadata-action` a mechanical, automatable operation, without ever regaining a GitHub API dependency at action runtime.

**Architecture:** Invert the fork's current strategy. Instead of editing upstream's engine so it stops asking for GitHub-shaped data, leave upstream's engine files untouched and *supply* that shape from git and the event file through a small shim. Upstream's `meta.ts`, `tag.ts`, `flavor.ts` and `image.ts` — and its test suite — are vendored and verified against the upstream tag. A scheduled workflow performs the sync deterministically and only escalates to a human when the typecheck or a gate fails.

**Tech Stack:** TypeScript (`nodenext`), Vitest 4, yarn 4, `@vercel/ncc`, `simple-git`, GitHub Actions.

**Spec:** [docs/superpowers/specs/2026-09-05-upstream-sync-design.md](../specs/2026-09-05-upstream-sync-design.md)

## Global Constraints

- **No GitHub API dependency, ever.** Never reintroduce `@actions/github` or `@docker/actions-toolkit` as real dependencies. The three-grep invariant on the built bundle must return 0/0/0, always excluding `dist/*.map`:
  ```bash
  grep -c "octokit\|Octokit\|rest\.repos\|rest\.git\|graphql\|@octokit" dist/index.js
  grep -c "actions-toolkit\|actions/github" dist/index.js
  grep -c "api\.github\.com" dist/index.js
  ```
- **Drop-in replacement.** `uses: LiquidLogicLabs/git-action-docker-metadata@v6` must be substitutable for `uses: docker/metadata-action@v6` assuming no SHA pin. Input names, output names and default behaviour match upstream.
- **This repo is deliberately different from its sibling repos.** Follow *upstream's* conventions: Vitest not Jest, `@actions/core@^3`, `type: module` / `nodenext`, yarn 4 not npm. Never apply monorepo conventions here.
- **Package manager is yarn 4.** Use `yarn`, never `npm`. `yarn build`, `yarn test`, `yarn lint`.
- **`nodenext` module resolution.** All relative imports carry a `.js` extension, even from `.ts` files.
- **`simple-git` uses the named export** — `import {simpleGit} from 'simple-git'`. The default import is not callable under `nodenext` and breaks the ncc build.
- **`dist/` is committed.** After any `src/` change run `yarn build` and commit `dist/index.js` with the source change.
- **Never run `yarn release:patch` / `release:minor` / `release:major`.** They call a `npm run package` target that does not exist. Documented in `CLAUDE.md`.
- **Versioning:** mirror upstream MAJOR.MINOR, own the PATCH. Upstream 6.2.x becomes fork 6.2.N. Floating `v6` and `v6.2` are maintained.
- **Fork base for all upstream comparisons:** commit `1107934` (upstream v6.0.0 + 14). Resolve upstream tags with `git ls-remote upstream`, **never** the local tag — local `v6`/`v6.0.0` tags are the fork's own and shadow upstream's.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/shims/github-types.ts` | `GitHubRepo` interface — the 5 fields upstream's engine reads |
| `src/shims/toolkit-context.ts` | `Context` class with static `tmpDir()` |
| `src/shims/github.ts` | `GitHub` class: static `context` getter, `repoData()` |
| `src/shims/toolkit.ts` | `Toolkit` class exposing `.github` |
| `src/vendor/meta.ts` etc. | Vendored upstream engine — never hand-edited |
| `scripts/vendor-upstream.mjs` | Performs a sync: fetch tag, copy files, record pointer |
| `scripts/check-vendored.mjs` | Asserts vendored files match the recorded upstream tag |
| `scripts/golden.mjs` | Produces golden output JSON from the built bundle |
| `__tests__/golden.test.ts` | Vitest assertion that golden output is unchanged |
| `.upstream-sync.json` | Records the synced upstream tag and commit |
| `.github/workflows/upstream-sync.yml` | The scheduled sync agent |

**Note on vendored file location.** Upstream's files import siblings as `./tag.js`, `./context.js` etc. Moving them into `src/vendor/` would break those relative imports. Therefore vendored files stay at `src/` alongside ours, and the vendored *set* is defined by an explicit list in `scripts/check-vendored.mjs` rather than by directory. This is decided in Task 3 and must not be changed later without updating that list.

---

### Task 1: Prove the seam end-to-end

This is the highest-risk task and it comes first deliberately. It answers both open unknowns from the spec: whether an alias survives all three toolchains (`tsc`, `vitest`, `ncc`), and whether the dist purity invariant still holds once upstream's files reference the toolkit.

**Files:**
- Create: `src/shims/probe.ts`
- Modify: `tsconfig.json`
- Modify: `vitest.config.ts`
- Test: `__tests__/probe.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a decision recorded in `docs/superpowers/plans/SEAM-DECISION.md` — either `alias` or `rewrite` — which Tasks 2–4 depend on. Also produces working `tsconfig.json` `paths` and `vitest.config.ts` `resolve.alias` entries if `alias` wins.

- [ ] **Step 1: Create a probe module that stands in for the toolkit**

Create `src/shims/probe.ts`:

```ts
export class ProbeContext {
  public static tmpDir(): string {
    return process.env.RUNNER_TEMP || '/tmp';
  }
}
```

- [ ] **Step 2: Add the alias to tsconfig.json**

Add `baseUrl` and `paths` to `compilerOptions` in `tsconfig.json`, keeping every existing option:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "esModuleInterop": true,
    "newLine": "lf",
    "outDir": "./lib",
    "rootDir": "./src",
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": false,
    "resolveJsonModule": true,
    "useUnknownInCatchVariables": false,
    "baseUrl": ".",
    "paths": {
      "@docker/actions-toolkit/lib/context.js": ["src/shims/probe.ts"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write a test that imports through the aliased specifier**

Create `__tests__/probe.test.ts`:

```ts
import {describe, expect, test} from 'vitest';
import {ProbeContext} from '@docker/actions-toolkit/lib/context.js';

describe('seam probe', () => {
  test('the aliased specifier resolves to our shim', () => {
    process.env.RUNNER_TEMP = '/probe-tmp';
    expect(ProbeContext.tmpDir()).toBe('/probe-tmp');
  });
});
```

- [ ] **Step 4: Add the matching alias to vitest.config.ts**

`tsconfig` `paths` does not affect Vitest's runtime resolution — it needs its own alias. Replace `vitest.config.ts` with:

```ts
import {defineConfig} from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@docker/actions-toolkit/lib/context.js': path.resolve(__dirname, 'src/shims/probe.ts')
    }
  },
  test: {
    clearMocks: true,
    environment: 'node',
    setupFiles: ['./__tests__/setup.unit.ts'],
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['clover'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/main.ts']
    }
  }
});
```

- [ ] **Step 5: Run the test — it must pass**

Run: `yarn test -- __tests__/probe.test.ts`
Expected: PASS. If it fails with "Cannot find module '@docker/actions-toolkit/lib/context.js'", the Vitest alias is wrong — fix the alias, not the test.

- [ ] **Step 6: Verify tsc also resolves it**

Run: `yarn tsc --noEmit`
Expected: no error mentioning `@docker/actions-toolkit`.

- [ ] **Step 7: Prove ncc bundles it — the real unknown**

Temporarily import the aliased specifier from production code so the bundler must resolve it. Add to the top of `src/main.ts`:

```ts
import {ProbeContext} from '@docker/actions-toolkit/lib/context.js';
// TEMPORARY probe — removed in Step 9
console.debug(ProbeContext.tmpDir());
```

Run: `yarn build`

Expected: the build succeeds. If ncc errors with a module-not-found for `@docker/actions-toolkit`, ncc does **not** honour tsconfig `paths`; go to Step 8's fallback.

- [ ] **Step 8: Check the dist purity invariant, then decide**

Run:

```bash
grep -c "octokit\|Octokit\|rest\.repos\|rest\.git\|graphql\|@octokit" dist/index.js
grep -c "actions-toolkit\|actions/github" dist/index.js
grep -c "api\.github\.com" dist/index.js
```

Expected: `0`, `0`, `0`.

Record the outcome in a new file `docs/superpowers/plans/SEAM-DECISION.md`:

```markdown
# Seam mechanism decision

Decided in Task 1 of the upstream-sync plan.

- ncc build with tsconfig paths: PASS | FAIL
- dist grep 1 (octokit): <count>
- dist grep 2 (actions-toolkit): <count>
- dist grep 3 (api.github.com): <count>

**Mechanism: alias | rewrite**
```

**If the build passed and all three greps are 0, the mechanism is `alias`.** Tasks 2–4 use aliasing as written.

**If the build failed, or grep 2 is non-zero, the mechanism is `rewrite`.** Aliasing is abandoned. Instead, `scripts/vendor-upstream.mjs` (Task 7) rewrites import specifiers at vendor time using exactly these four rules, applied only to lines beginning with `import`:

| Upstream specifier | Rewritten to |
|---|---|
| `@docker/actions-toolkit/lib/context.js` | `./shims/toolkit-context.js` |
| `@docker/actions-toolkit/lib/types/github/github.js` | `./shims/github-types.js` |
| `@docker/actions-toolkit/lib/github/github.js` | `./shims/github.js` |
| `@docker/actions-toolkit/lib/toolkit.js` | `./shims/toolkit.js` |

Under `rewrite`, vendored files are "upstream's file with exactly these import lines rewritten" rather than byte-identical, and `scripts/check-vendored.mjs` (Task 3) verifies by re-applying the rewrite to the upstream file and diffing. Delete the `paths` block from `tsconfig.json` and the `resolve.alias` block from `vitest.config.ts` if this branch is taken.

- [ ] **Step 9: Remove the temporary probe from main.ts**

Delete the two probe lines added to `src/main.ts` in Step 7. Run `yarn build` again and confirm `dist/` rebuilds cleanly.

- [ ] **Step 10: Commit**

```bash
git add tsconfig.json vitest.config.ts src/shims/probe.ts __tests__/probe.test.ts \
        docs/superpowers/plans/SEAM-DECISION.md dist/
git commit -m "test: prove the toolkit seam resolves in tsc, vitest and ncc

Records whether tsconfig paths survive ncc bundling and whether the dist
purity invariant holds once upstream's toolkit specifiers are present.
Decides the mechanism used by the rest of the plan."
```

---

### Task 2: Build the shim

**Files:**
- Create: `src/shims/github-types.ts`
- Create: `src/shims/toolkit-context.ts`
- Create: `src/shims/github.ts`
- Create: `src/shims/toolkit.ts`
- Delete: `src/shims/probe.ts`
- Test: `__tests__/shims.test.ts`
- Modify: `tsconfig.json`, `vitest.config.ts` (only if mechanism is `alias`)

**Interfaces:**
- Consumes: `getGitContext()` and `parseRepoFromRemoteUrl(remoteUrl: string, defaultBranch: string): Repo` from `src/git.ts`; `Repo` has `{name: string; description?: string; url?: string; default_branch: string; license?: string}`.
- Produces:
  - `interface GitHubRepo {name: string; description: string; html_url: string; license: string | null; default_branch: string}` from `src/shims/github-types.ts`
  - `class Context { static tmpDir(): string }` from `src/shims/toolkit-context.ts`
  - `class GitHub { static get context(): MetadataContext; repoData(): Promise<GitHubRepo> }` from `src/shims/github.ts`
  - `class Toolkit { github: GitHub }` from `src/shims/toolkit.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/shims.test.ts`:

```ts
import {beforeEach, describe, expect, test, vi} from 'vitest';
import {Context as ToolkitContext} from '../src/shims/toolkit-context.js';
import {GitHub} from '../src/shims/github.js';
import {Toolkit} from '../src/shims/toolkit.js';
import * as git from '../src/git.js';

describe('toolkit shim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('tmpDir prefers RUNNER_TEMP', () => {
    process.env.RUNNER_TEMP = '/runner-temp';
    expect(ToolkitContext.tmpDir()).toBe('/runner-temp');
  });

  test('tmpDir falls back to the OS temp dir when RUNNER_TEMP is unset', () => {
    delete process.env.RUNNER_TEMP;
    expect(ToolkitContext.tmpDir().length).toBeGreaterThan(0);
  });

  test('repoData maps a git Repo onto the GitHubRepo shape', async () => {
    vi.spyOn(git, 'getGitContext').mockResolvedValue({
      sha: 'abc',
      ref: 'refs/heads/main',
      commitDate: new Date('2020-01-10T00:30:00.000Z'),
      remoteUrl: 'https://github.com/octocat/Hello-World.git',
      defaultBranch: 'main'
    });
    const repo = await new Toolkit().github.repoData();
    expect(repo.name).toBe('Hello-World');
    expect(repo.default_branch).toBe('main');
    expect(repo.html_url).toBe('https://github.com/octocat/Hello-World');
    // Not derivable from git without an API — documented limitation.
    expect(repo.description).toBe('');
    expect(repo.license).toBeNull();
  });

  test('GitHub.context is spy-able, which upstream tests rely on', () => {
    vi.spyOn(GitHub, 'context', 'get').mockReturnValue({
      ref: 'refs/heads/spy',
      sha: 'deadbeef',
      commitDate: new Date('2020-01-10T00:30:00.000Z'),
      eventName: 'push',
      payload: {}
    });
    expect(GitHub.context.ref).toBe('refs/heads/spy');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `yarn test -- __tests__/shims.test.ts`
Expected: FAIL — `Cannot find module '../src/shims/toolkit-context.js'`.

- [ ] **Step 3: Write the type shim**

Create `src/shims/github-types.ts`:

```ts
/**
 * The exact surface upstream's engine reads off a repository. Enumerated by
 * compiling upstream's files against an empty shim, NOT by grep — a grep over
 * `repo.` under-reports, and an earlier one did.
 *
 * `description` and `license` are not derivable from git. They are supplied as
 * empty/null and the corresponding OCI labels are emitted empty. This is a
 * documented, deliberate limitation of a fork that makes no API calls.
 */
export interface GitHubRepo {
  name: string;
  description: string;
  html_url: string;
  // An OBJECT, not a string: upstream's engine reads `repo.license?.spdx_id`.
  // The GitHub API returns {key, name, spdx_id, url, node_id}; only spdx_id is read.
  license: {spdx_id: string} | null;
  default_branch: string;
}
```

- [ ] **Step 4: Write the context shim**

Create `src/shims/toolkit-context.ts`:

```ts
import * as os from 'os';

/**
 * Stands in for `@docker/actions-toolkit/lib/context.js`. Upstream's engine uses
 * exactly one member of it — `tmpDir()`, at the bake-file write in meta.ts.
 */
export class Context {
  public static tmpDir(): string {
    return process.env.RUNNER_TEMP || os.tmpdir();
  }
}
```

- [ ] **Step 5: Write the GitHub shim**

Create `src/shims/github.ts`:

```ts
import * as fs from 'fs';
import {getGitContext, parseRepoFromRemoteUrl} from '../git.js';
import type {Context as MetadataContext} from '../context.js';
import type {GitHubRepo} from './github-types.js';

/**
 * Stands in for `@docker/actions-toolkit/lib/github/github.js`.
 *
 * Upstream's own test suite spies on `GitHub.prototype.repoData` and on the
 * static `context` getter, so both must exist with those exact names for the
 * vendored suite to run. Production code reads through the same seam.
 */
export class GitHub {
  public static get context(): MetadataContext {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const payload = eventPath && fs.existsSync(eventPath) ? JSON.parse(fs.readFileSync(eventPath, 'utf8')) : {};
    return {
      ref: process.env.GITHUB_REF || '',
      sha: process.env.GITHUB_SHA || '',
      commitDate: new Date(),
      eventName: process.env.GITHUB_EVENT_NAME || '',
      payload
    };
  }

  public async repoData(): Promise<GitHubRepo> {
    const ctx = await getGitContext();
    const repo = parseRepoFromRemoteUrl(ctx.remoteUrl || '', ctx.defaultBranch);
    return {
      name: repo.name,
      default_branch: repo.default_branch,
      html_url: repo.url || '',
      // Neither is obtainable without an API call. See github-types.ts.
      description: '',
      license: null
    };
  }
}
```

- [ ] **Step 6: Write the Toolkit shim**

Create `src/shims/toolkit.ts`:

```ts
import {GitHub} from './github.js';

/**
 * Stands in for `@docker/actions-toolkit/lib/toolkit.js`. Upstream's tests
 * construct `new Toolkit()` and reach `toolkit.github.repoData()`; that path is
 * the whole of the surface they use.
 */
export class Toolkit {
  public github: GitHub;

  constructor() {
    this.github = new GitHub();
  }
}
```

- [ ] **Step 7: Point the aliases at the real shims**

Only if Task 1 decided `alias`. Replace the `paths` block in `tsconfig.json`:

```json
"paths": {
  "@docker/actions-toolkit/lib/context.js": ["src/shims/toolkit-context.ts"],
  "@docker/actions-toolkit/lib/types/github/github.js": ["src/shims/github-types.ts"],
  "@docker/actions-toolkit/lib/github/github.js": ["src/shims/github.ts"],
  "@docker/actions-toolkit/lib/toolkit.js": ["src/shims/toolkit.ts"]
}
```

And the matching `resolve.alias` in `vitest.config.ts`:

```ts
resolve: {
  alias: {
    '@docker/actions-toolkit/lib/context.js': path.resolve(__dirname, 'src/shims/toolkit-context.ts'),
    '@docker/actions-toolkit/lib/types/github/github.js': path.resolve(__dirname, 'src/shims/github-types.ts'),
    '@docker/actions-toolkit/lib/github/github.js': path.resolve(__dirname, 'src/shims/github.ts'),
    '@docker/actions-toolkit/lib/toolkit.js': path.resolve(__dirname, 'src/shims/toolkit.ts')
  }
},
```

- [ ] **Step 8: Delete the probe and its test**

```bash
rm src/shims/probe.ts __tests__/probe.test.ts
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `yarn test -- __tests__/shims.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 10: Commit**

```bash
yarn build
git add src/shims/ __tests__/shims.test.ts tsconfig.json vitest.config.ts dist/
git rm --cached src/shims/probe.ts __tests__/probe.test.ts 2>/dev/null || true
git commit -m "feat: add the toolkit shim backed by git

Supplies the GitHubRepo shape, tmpDir(), and the GitHub/Toolkit classes that
upstream's engine and its test suite reach for, sourced from git and the event
file rather than the GitHub API. description and license are emitted empty
because no API call is made; this is deliberate and documented."
```

---

### Task 3: Vendor upstream's engine and verify it

**Files:**
- Modify: `src/meta.ts` (replaced with upstream's verbatim)
- Modify: `src/context.ts` (keep ours; only the `Context` interface must satisfy the vendored engine)
- Create: `scripts/check-vendored.mjs`
- Create: `.upstream-sync.json`
- Modify: `package.json` (add `check:vendored` script)

**Interfaces:**
- Consumes: the shim from Task 2; the mechanism decision from Task 1.
- Produces: `.upstream-sync.json` of shape `{"tag": "v6.2.0", "commit": "<40-char sha>", "syncedAt": "<ISO8601>", "vendored": ["src/meta.ts", "src/tag.ts", "src/flavor.ts", "src/image.ts"]}`; and `yarn check:vendored` which exits non-zero when a vendored file has drifted.

- [ ] **Step 1: Record the upstream pointer**

Resolve the upstream tag's commit — never use the local tag, which is the fork's own:

```bash
UPSTREAM_TAG=v6.2.0
# Upstream's tags are LIGHTWEIGHT, so the ^{} peel form resolves to nothing; fall
# back to the plain ref. Do not use `git fetch --tags` — it fails on this fork
# because our own v6/v6.0.0 tags collide with upstream's.
UPSTREAM_SHA=$(git ls-remote upstream "refs/tags/${UPSTREAM_TAG}^{}" | awk '{print $1}')
[ -z "$UPSTREAM_SHA" ] && UPSTREAM_SHA=$(git ls-remote upstream "refs/tags/${UPSTREAM_TAG}" | awk '{print $1}')
echo "$UPSTREAM_SHA"
```

Write `.upstream-sync.json` from that value — do not hand-copy the SHA:

```bash
node -e '
const {execFileSync} = require("child_process");
const tag = process.env.UPSTREAM_TAG;
const commit = execFileSync("git", ["ls-remote", "upstream", `refs/tags/${tag}^{}`], {encoding: "utf8"}).trim().split(/\s+/)[0];
if (!commit || commit.length !== 40) { console.error("could not resolve " + tag); process.exit(1); }
require("fs").writeFileSync(".upstream-sync.json", JSON.stringify({
  tag, commit, syncedAt: new Date().toISOString(),
  vendored: ["src/meta.ts", "src/tag.ts", "src/flavor.ts", "src/image.ts"]
}, null, 2) + "\n");
console.log("wrote .upstream-sync.json for " + tag + " (" + commit.slice(0,9) + ")");
'
cat .upstream-sync.json
```

Expected: a 40-character `commit` value. If it is empty, the `upstream` remote is
missing — add it with
`git remote add upstream https://github.com/docker/metadata-action.git`.

- [ ] **Step 2: Write the drift checker**

Create `scripts/check-vendored.mjs`:

```js
#!/usr/bin/env node
// Asserts every vendored file still matches the upstream commit recorded in
// .upstream-sync.json. A vendored file is upstream's file, optionally with the
// four toolkit import specifiers rewritten (see REWRITES). Anything else is drift.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const REWRITES = [
  ['@docker/actions-toolkit/lib/context.js', './shims/toolkit-context.js'],
  ['@docker/actions-toolkit/lib/types/github/github.js', './shims/github-types.js'],
  ['@docker/actions-toolkit/lib/github/github.js', './shims/github.js'],
  ['@docker/actions-toolkit/lib/toolkit.js', './shims/toolkit.js']
];

// Set to true only if Task 1 decided the `rewrite` mechanism.
const REWRITE_MODE = process.env.VENDOR_REWRITE === '1';

const sync = JSON.parse(readFileSync('.upstream-sync.json', 'utf8'));
let failed = 0;

for (const file of sync.vendored) {
  let upstream;
  try {
    upstream = execFileSync('git', ['show', `${sync.commit}:${file}`], {encoding: 'utf8'});
  } catch {
    console.error(`FAIL ${file}: not present at upstream ${sync.commit}`);
    failed++;
    continue;
  }
  if (REWRITE_MODE) {
    for (const [from, to] of REWRITES) {
      upstream = upstream.split(`'${from}'`).join(`'${to}'`);
    }
  }
  const local = readFileSync(file, 'utf8');
  if (local !== upstream) {
    console.error(`FAIL ${file}: differs from upstream ${sync.tag} (${sync.commit.slice(0, 9)})`);
    failed++;
  } else {
    console.log(`ok   ${file}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} vendored file(s) drifted. Vendored files are never hand-edited.`);
  process.exit(1);
}
console.log(`\nAll ${sync.vendored.length} vendored files match upstream ${sync.tag}.`);
```

- [ ] **Step 3: Run the checker to verify it FAILS**

Run: `node scripts/check-vendored.mjs`
Expected: FAIL for `src/meta.ts` — the fork's `meta.ts` still has its 34-added/51-removed divergence. `tag.ts`, `flavor.ts`, `image.ts` should already report `ok`, since the fork never edited them. If any of those three fail, stop and investigate before proceeding.

- [ ] **Step 4: Replace meta.ts with upstream's verbatim**

```bash
UPSTREAM_SHA=$(node -p "require('./.upstream-sync.json').commit")
git show "${UPSTREAM_SHA}:src/meta.ts" > src/meta.ts
```

If Task 1 decided `rewrite`, also apply the four specifier rewrites to `src/meta.ts` now:

```bash
sed -i \
  -e "s#'@docker/actions-toolkit/lib/context.js'#'./shims/toolkit-context.js'#" \
  -e "s#'@docker/actions-toolkit/lib/types/github/github.js'#'./shims/github-types.js'#" \
  src/meta.ts
```

- [ ] **Step 5: Make our Context satisfy the vendored engine**

The vendored `meta.ts` reads five members off `Context`. Ensure `src/context.ts` declares them. Its `Context` interface must include exactly:

```ts
export interface Context {
  ref: string;
  sha: string;
  commitDate: Date;
  eventName: string;
  payload: {
    base_ref?: string;
    repository?: {default_branch?: string};
    pull_request?: {base?: {ref?: string}};
    [key: string]: unknown;
  };
}
```

Keep the existing `getContext()` implementation, but populate `payload` from `GITHUB_EVENT_PATH` (parsed JSON, or `{}` when absent) and drop the now-unused `baseRef` field — the vendored engine reads `payload.base_ref` directly, which is what upstream's own tests exercise.

- [ ] **Step 6: Typecheck**

Run: `yarn tsc --noEmit`
Expected: no errors. Any `Property 'x' does not exist on type 'Context'` names a field the shim or `Context` is missing — add it rather than editing the vendored file.

- [ ] **Step 7: Verify the vendored check now passes**

Run: `node scripts/check-vendored.mjs`
Expected: `All 4 vendored files match upstream v6.2.0.`

- [ ] **Step 8: Add the script to package.json**

Add to `scripts` in `package.json`:

```json
"check:vendored": "node scripts/check-vendored.mjs"
```

- [ ] **Step 9: Run the existing suite and the purity invariant**

```bash
yarn test
yarn build
grep -c "octokit\|Octokit\|rest\.repos\|rest\.git\|graphql\|@octokit" dist/index.js
grep -c "actions-toolkit\|actions/github" dist/index.js
grep -c "api\.github\.com" dist/index.js
```

Expected: tests pass; all three greps return `0`.

- [ ] **Step 10: Commit**

```bash
git add src/meta.ts src/context.ts scripts/check-vendored.mjs .upstream-sync.json package.json dist/
git commit -m "feat: vendor upstream's engine verbatim behind the shim

src/meta.ts is now upstream v6.2.0's file, unmodified. The fork's divergence
(34 added / 51 removed) is gone; the GitHub-shaped data it reads is supplied by
the shim from git and the event file instead. check:vendored asserts the four
vendored files still match the recorded upstream commit, so hand-edits fail CI."
```

---

### Task 4: Vendor upstream's test suite

This is the task that restores real coverage. Upstream has roughly 365 table-driven cases over the engine; the fork replaced them with 3 smoke tests.

**Files:**
- Modify: `__tests__/meta.test.ts` (replaced with upstream's)
- Create: `__tests__/vendored-exceptions.ts`
- Modify: `.upstream-sync.json` (add test files to `vendored`)

**Interfaces:**
- Consumes: shim from Task 2; vendored engine from Task 3.
- Produces: `EXPECTED_EXCEPTION_COUNT: number` and `EXCEPTIONS: string[]` exported from `__tests__/vendored-exceptions.ts`.

- [ ] **Step 1: Replace the fork's meta.test.ts with upstream's**

```bash
UPSTREAM_SHA=$(node -p "require('./.upstream-sync.json').commit")
git show "${UPSTREAM_SHA}:__tests__/meta.test.ts" > __tests__/meta.test.ts
git show "${UPSTREAM_SHA}:__tests__/fixtures/repo.json" > __tests__/fixtures/repo.json
```

- [ ] **Step 2: Run it and record what actually fails**

Run: `yarn test -- __tests__/meta.test.ts 2>&1 | tee /tmp/vendored-run.txt`

Do **not** guess which tests fail. Capture the real list:

```bash
grep -E '^\s*(×|✕|FAIL)' /tmp/vendored-run.txt | sed 's/^\s*//' | sort -u
```

Expected: failures confined to assertions on `org.opencontainers.image.description` and `org.opencontainers.image.licenses`. If anything else fails, that is a genuine behavioural difference and must be fixed in the shim or `context.ts` — never by adding an exception.

- [ ] **Step 3: Generate the exception list from the observed failures**

Generate the list mechanically from the run captured in Step 2, so it reflects
what actually failed rather than what someone expected to fail:

```bash
node -e '
const fs = require("fs");
const raw = fs.readFileSync("/tmp/vendored-run.txt", "utf8");
const names = [...new Set(
  raw.split("\n")
     .filter(l => /^\s*[×✕]/.test(l))
     .map(l => l.replace(/^\s*[×✕]\s*/, "").replace(/\s+\d+ms$/, "").trim())
     .filter(Boolean)
)].sort();
const body = names.map(n => "  " + JSON.stringify(n) + ",").join("\n");
fs.writeFileSync("__tests__/vendored-exceptions.ts",
`/**
 * Assertions in the vendored upstream suite that cannot pass in a fork making no
 * GitHub API calls, because they assert API-derived label values.
 *
 * GENERATED from an actual failing run, not written by hand. Enumerated case by
 * case, never a wildcard: a broad skip here would become the place failures hide,
 * which is the false-green failure mode — a suite reporting success while
 * checking nothing.
 */
export const EXCEPTIONS: string[] = [
${body}
];

export const EXPECTED_EXCEPTION_COUNT = ${names.length};
`);
console.log("generated " + names.length + " exception(s)");
'
cat __tests__/vendored-exceptions.ts
```

**Before continuing, read the generated list.** Every entry must be a
`description`/`licenses` assertion. If any other test name appears, that is a real
behavioural difference: remove it from the list, and fix the shim or `context.ts`
so it passes. The generated file should look like:

```ts
/**
 * Assertions in the vendored upstream suite that cannot pass in a fork making no
 * GitHub API calls, because they assert API-derived label values.
 *
 * Enumerated case by case, never a wildcard: a broad skip here would become the
 * place failures hide, which is the false-green failure mode — a suite reporting
 * success while checking nothing.
 *
 * EXPECTED_EXCEPTION_COUNT is asserted in vendored-exceptions.test.ts so that
 * silently growing this list fails CI.
 */
export const EXCEPTIONS: string[] = [
  // Generated by the command in Step 3 from the actual failing run. Never edited
  // by hand to make a failure go away.
];

export const EXPECTED_EXCEPTION_COUNT = 12; // the real count from the run
```

`EXPECTED_EXCEPTION_COUNT` is a literal, never `EXCEPTIONS.length` — deriving it
from the array would make the guard in Step 4 tautological, passing no matter how
many entries were added later.

- [ ] **Step 4: Write the test that guards the exception list**

Create `__tests__/vendored-exceptions.test.ts`:

```ts
import {describe, expect, test} from 'vitest';
import {EXCEPTIONS, EXPECTED_EXCEPTION_COUNT} from './vendored-exceptions.js';

describe('vendored suite exception list', () => {
  test('has not silently grown', () => {
    expect(EXCEPTIONS.length).toBe(EXPECTED_EXCEPTION_COUNT);
  });

  test('contains no wildcards', () => {
    for (const name of EXCEPTIONS) {
      expect(name).not.toContain('*');
      expect(name.trim().length).toBeGreaterThan(0);
    }
  });

  test('is small enough to review by eye', () => {
    expect(EXCEPTIONS.length).toBeLessThanOrEqual(40);
  });
});
```

- [ ] **Step 5: Exclude the excepted cases in the vendored suite**

At the top of `__tests__/meta.test.ts`, immediately after the existing imports, add the single hand-maintained edit this file is permitted to carry:

```ts
// VENDORED-EDIT: the only permitted modification to this file. See
// vendored-exceptions.ts for why these cases cannot pass in an API-free fork.
import {EXCEPTIONS} from './vendored-exceptions.js';
const skipIfExcepted = (name: string) => (EXCEPTIONS.includes(name) ? test.skip : test);
```

Then change each excepted `test('name', ...)` call to `skipIfExcepted('name')('name', ...)`.

- [ ] **Step 6: Record the permitted edit in the drift checker**

Because `__tests__/meta.test.ts` now carries one intentional edit, it cannot be byte-compared. Add it to `.upstream-sync.json` under a separate key rather than `vendored`:

```bash
node -e '
const fs = require("fs");
const sync = JSON.parse(fs.readFileSync(".upstream-sync.json", "utf8"));
sync.vendoredWithEdits = ["__tests__/meta.test.ts"];
fs.writeFileSync(".upstream-sync.json", JSON.stringify(sync, null, 2) + "\n");
'
cat .upstream-sync.json
```

This preserves the existing `tag` and `commit` rather than retyping them.

`check-vendored.mjs` ignores `vendoredWithEdits` — those files are covered by the suite passing, not by byte equality.

- [ ] **Step 7: Run the full suite**

Run: `yarn test`
Expected: all tests pass, with only the enumerated exceptions skipped. Note the new total — it should be in the hundreds, not 66.

- [ ] **Step 8: Commit**

```bash
git add __tests__/meta.test.ts __tests__/vendored-exceptions.ts \
        __tests__/vendored-exceptions.test.ts __tests__/fixtures/repo.json .upstream-sync.json
git commit -m "test: vendor upstream's meta suite against the shim

Restores upstream's table-driven coverage of the tag/label engine, which the
fork had replaced with 3 smoke tests while still shipping ~87% of the engine.
Cases asserting API-derived description/licenses values are excepted by exact
name; the list is length-asserted so it cannot grow silently."
```

---

### Task 5: Fix the bake-target drop-in break

**Files:**
- Modify: `src/context.ts` (the `bakeTarget` default)
- Test: `__tests__/context.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/context.test.ts`:

```ts
test('bake-target defaults to upstream value so the action stays drop-in', () => {
  delete process.env['INPUT_BAKE-TARGET'];
  expect(getInputs().bakeTarget).toBe('docker-metadata-action');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `yarn test -- __tests__/context.test.ts`
Expected: FAIL — received `'git-action-docker-metadata'`.

- [ ] **Step 3: Restore upstream's default**

In `src/context.ts`, change the `bakeTarget` line to:

```ts
bakeTarget: core.getInput('bake-target') || `docker-metadata-action`
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `yarn test -- __tests__/context.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the input description in action.yml**

In `action.yml`, restore the upstream wording:

```yaml
  bake-target:
    description: 'Bake target name (default docker-metadata-action)'
    required: false
```

- [ ] **Step 6: Commit**

```bash
yarn build
git add src/context.ts action.yml __tests__/context.test.ts dist/
git commit -m "fix: restore upstream's bake-target default

The fork defaulted bake-target to git-action-docker-metadata where upstream uses
docker-metadata-action. Anyone swapping this action in for docker/metadata-action
and consuming bake output without setting bake-target got a different target name
and a bake file that no longer matched. BEHAVIOUR CHANGE for anyone who relied on
the fork's default; note it in the release."
```

---

### Task 6: Golden-output parity

**Files:**
- Create: `scripts/golden.mjs`
- Create: `__tests__/golden/scenarios.json`
- Create: `__tests__/golden/expected.json`
- Create: `__tests__/golden.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: the built `dist/index.js`.
- Produces: `yarn golden:record` (regenerates `expected.json`) and a Vitest assertion that current output matches it.

The assertion lives in Vitest. `scripts/golden.mjs` only *produces* data — it is not a test runner, and no bespoke assertion framework is introduced.

- [ ] **Step 1: Define the scenarios**

Create `__tests__/golden/scenarios.json`:

```json
[
  {
    "name": "push-branch",
    "env": {"GITHUB_REF": "refs/heads/main", "GITHUB_SHA": "860c1904a1ce19322e91ac35af1ab07466440c37", "GITHUB_EVENT_NAME": "push"},
    "inputs": {"images": "local/app", "tags": "type=ref,event=branch\ntype=sha"}
  },
  {
    "name": "push-tag-semver",
    "env": {"GITHUB_REF": "refs/tags/v1.2.3", "GITHUB_SHA": "860c1904a1ce19322e91ac35af1ab07466440c37", "GITHUB_EVENT_NAME": "push"},
    "inputs": {"images": "local/app", "tags": "type=semver,pattern={{version}}\ntype=semver,pattern={{major}}.{{minor}}"}
  },
  {
    "name": "flavor-prefix-suffix",
    "env": {"GITHUB_REF": "refs/heads/main", "GITHUB_SHA": "860c1904a1ce19322e91ac35af1ab07466440c37", "GITHUB_EVENT_NAME": "push"},
    "inputs": {"images": "local/app", "tags": "type=ref,event=branch", "flavor": "prefix=v-,suffix=-alpha,latest=true"}
  }
]
```

- [ ] **Step 2: Write the producer script**

Create `scripts/golden.mjs`:

```js
#!/usr/bin/env node
// Runs the BUILT bundle over each scenario and records its outputs, so a sync
// that changes emitted tags/labels is visible as a diff rather than a surprise.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const scenarios = JSON.parse(readFileSync('__tests__/golden/scenarios.json', 'utf8'));
const results = {};

for (const s of scenarios) {
  const dir = mkdtempSync(join(tmpdir(), 'golden-'));
  const outFile = join(dir, 'output');
  writeFileSync(outFile, '');
  const env = {
    ...process.env,
    ...s.env,
    GITHUB_OUTPUT: outFile,
    GITHUB_STATE: join(dir, 'state'),
    RUNNER_TEMP: dir
  };
  for (const [k, v] of Object.entries(s.inputs)) {
    env[`INPUT_${k.toUpperCase()}`] = v;
  }
  execFileSync('node', ['dist/index.js'], {env, stdio: 'pipe'});
  results[s.name] = readFileSync(outFile, 'utf8').trim().split('\n').sort();
}

const target = process.argv[2] === '--record' ? '__tests__/golden/expected.json' : '__tests__/golden/actual.json';
writeFileSync(target, JSON.stringify(results, null, 2) + '\n');
console.log(`wrote ${target}`);
```

- [ ] **Step 3: Record the baseline**

```bash
yarn build
node scripts/golden.mjs --record
```

- [ ] **Step 4: Write the Vitest assertion**

Create `__tests__/golden.test.ts`:

```ts
import {describe, expect, test, beforeAll} from 'vitest';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

describe('golden output parity', () => {
  beforeAll(() => {
    execFileSync('node', ['scripts/golden.mjs'], {stdio: 'pipe'});
  });

  test('emitted tags and labels are unchanged', () => {
    const expected = JSON.parse(readFileSync('__tests__/golden/expected.json', 'utf8'));
    const actual = JSON.parse(readFileSync('__tests__/golden/actual.json', 'utf8'));
    expect(actual).toEqual(expected);
  });

  test('every scenario produced output', () => {
    const actual = JSON.parse(readFileSync('__tests__/golden/actual.json', 'utf8'));
    for (const [name, lines] of Object.entries(actual)) {
      expect((lines as string[]).length, `scenario ${name} produced no output`).toBeGreaterThan(0);
    }
  });
});
```

The second test exists because an empty result would otherwise compare equal to an empty baseline and pass while checking nothing.

- [ ] **Step 5: Run it**

Run: `yarn test -- __tests__/golden.test.ts`
Expected: PASS.

- [ ] **Step 6: Add scripts and ignore the actual file**

Add to `package.json` `scripts`:

```json
"golden:record": "node scripts/golden.mjs --record"
```

Add to `.gitignore`:

```
__tests__/golden/actual.json
```

- [ ] **Step 7: Commit**

```bash
git add scripts/golden.mjs __tests__/golden/ __tests__/golden.test.ts package.json .gitignore
git commit -m "test: add golden-output parity over the built bundle

Records emitted tags and labels for representative scenarios so a sync that
changes real output shows up as a diff. Includes a non-emptiness assertion,
because an empty result would otherwise match an empty baseline and pass while
checking nothing."
```

---

### Task 7: The sync script

**Files:**
- Create: `scripts/vendor-upstream.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `.upstream-sync.json` shape from Task 3.
- Produces: `yarn sync:upstream <tag>` which updates vendored files and the pointer, and exits non-zero on any failure.

- [ ] **Step 1: Write the sync script**

> **SUPERSEDED — read `scripts/vendor-upstream.mjs` instead.** The code block below
> is the ORIGINAL plan text and contains two confirmed bugs that the shipped script
> fixes: (1) it resolves the tag with `refs/tags/<tag>^{}` only, but upstream's tags
> are LIGHTWEIGHT, so that peel form returns nothing and the script exits 1 on every
> sync; (2) it calls `git fetch upstream --tags`, which fails here with "would
> clobber existing tag" because this fork's own v6/v6.0.0 release tags share names
> with upstream's — and `--tags` forces the default refspec regardless of any
> `remote.upstream.fetch` namespacing, so the namespaced config does not save it.
> Kept verbatim for the record of what was planned; the file on disk is the source
> of truth.

Create `scripts/vendor-upstream.mjs`:

```js
#!/usr/bin/env node
// Performs a sync: resolve the upstream tag, copy the vendored file set, update
// the pointer. Deliberately does NOT run tests or commit — the caller gates on
// those, so this script has exactly one job.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error('usage: vendor-upstream.mjs vX.Y.Z');
  process.exit(2);
}

const REWRITES = [
  ['@docker/actions-toolkit/lib/context.js', './shims/toolkit-context.js'],
  ['@docker/actions-toolkit/lib/types/github/github.js', './shims/github-types.js'],
  ['@docker/actions-toolkit/lib/github/github.js', './shims/github.js'],
  ['@docker/actions-toolkit/lib/toolkit.js', './shims/toolkit.js']
];
const REWRITE_MODE = process.env.VENDOR_REWRITE === '1';

execFileSync('git', ['fetch', 'upstream', '--tags'], {stdio: 'inherit'});

// Resolve via ls-remote: the LOCAL tag of the same name is the fork's own and
// shadows upstream's. Using it would silently vendor the fork's own files.
const out = execFileSync('git', ['ls-remote', 'upstream', `refs/tags/${tag}^{}`], {encoding: 'utf8'}).trim();
const commit = out.split(/\s+/)[0];
if (!commit || commit.length !== 40) {
  console.error(`could not resolve upstream ${tag} to a commit`);
  process.exit(1);
}

const sync = JSON.parse(readFileSync('.upstream-sync.json', 'utf8'));
const files = [...sync.vendored, ...(sync.vendoredWithEdits || [])];

for (const file of files) {
  let content = execFileSync('git', ['show', `${commit}:${file}`], {encoding: 'utf8'});
  if (REWRITE_MODE) {
    for (const [from, to] of REWRITES) {
      content = content.split(`'${from}'`).join(`'${to}'`);
    }
  }
  writeFileSync(file, content);
  console.log(`vendored ${file}`);
}

sync.tag = tag;
sync.commit = commit;
sync.syncedAt = new Date().toISOString();
writeFileSync('.upstream-sync.json', JSON.stringify(sync, null, 2) + '\n');
console.log(`\npointer updated to ${tag} (${commit.slice(0, 9)})`);
console.log('NOTE: files in vendoredWithEdits were overwritten and their permitted');
console.log('edits must be re-applied by hand before the suite will pass.');
```

- [ ] **Step 2: Verify it is a no-op against the current tag**

```bash
node scripts/vendor-upstream.mjs v6.2.0
git diff --stat
```

Expected: `src/meta.ts`, `src/tag.ts`, `src/flavor.ts`, `src/image.ts` unchanged. `__tests__/meta.test.ts` **will** show a diff, because it is in `vendoredWithEdits` and its permitted edit was overwritten.

- [ ] **Step 3: Restore the permitted edit and confirm green**

```bash
git checkout -- __tests__/meta.test.ts
yarn test
node scripts/check-vendored.mjs
```

Expected: both pass.

- [ ] **Step 4: Add the script to package.json**

```json
"sync:upstream": "node scripts/vendor-upstream.mjs"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/vendor-upstream.mjs package.json
git commit -m "feat: add the upstream vendoring script

Resolves the upstream tag via ls-remote rather than the local tag of the same
name, which is the fork's own and would otherwise cause it to vendor its own
files back over themselves."
```

---

### Task 8: The sync agent

**Files:**
- Create: `.github/workflows/upstream-sync.yml`

**Interfaces:**
- Consumes: `yarn sync:upstream`, `yarn check:vendored`, `yarn test`, `yarn build`.
- Produces: a branch `sync/upstream-<tag>` and a pull request, or nothing when already current.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/upstream-sync.yml`:

```yaml
name: upstream-sync

on:
  schedule:
    - cron: '0 7 * * *'
  workflow_dispatch:
    inputs:
      tag:
        description: 'Upstream tag to sync (e.g. v6.3.0)'
        required: false
        type: string

# Single-flight: two runs must never race the same branch.
concurrency:
  group: upstream-sync
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  sync:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          fetch-depth: 0

      - name: Add upstream remote
        run: |
          git remote add upstream https://github.com/docker/metadata-action.git || true
          # Upstream tags land in their own namespace so they cannot shadow ours.
          # NOTE: `git fetch upstream --tags` is deliberately NOT used. It fails with
          # "would clobber existing tag" because this fork's own v6/v6.0.0 release tags
          # share names with upstream's, and a non-zero exit aborts the job. No local
          # tag fetch is needed anyway: discovery below uses ls-remote, and
          # vendor-upstream.mjs fetches the resolved commit SHA directly.
          git config --replace-all remote.upstream.fetch '+refs/tags/*:refs/upstream-tags/*'

      - name: Determine target tag
        id: target
        env:
          Z_INPUT_TAG: ${{ github.event.inputs.tag }}
        run: |
          set -euo pipefail
          if [ -n "${Z_INPUT_TAG}" ]; then
            target="${Z_INPUT_TAG}"
          else
            target=$(git ls-remote --tags --refs upstream 'refs/tags/v*' \
              | awk '{print $2}' | sed 's#refs/tags/##' \
              | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)
          fi
          current=$(node -p "require('./.upstream-sync.json').tag")
          echo "target=${target}" >> "$GITHUB_OUTPUT"
          echo "current=${current}" >> "$GITHUB_OUTPUT"
          if [ "${target}" = "${current}" ]; then
            echo "uptodate=true" >> "$GITHUB_OUTPUT"
          else
            echo "uptodate=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Already current
        if: steps.target.outputs.uptodate == 'true'
        run: echo "Already on upstream ${{ steps.target.outputs.current }}. Nothing to do."

      - name: Setup Node.js
        if: steps.target.outputs.uptodate == 'false'
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        with:
          node-version: '24'

      - name: Install
        if: steps.target.outputs.uptodate == 'false'
        run: yarn install --immutable

      - name: Vendor the upstream tag
        if: steps.target.outputs.uptodate == 'false'
        run: yarn sync:upstream "${{ steps.target.outputs.target }}"

      - name: Typecheck — the tripwire
        if: steps.target.outputs.uptodate == 'false'
        run: yarn tsc --noEmit

      - name: Vendored files match upstream
        if: steps.target.outputs.uptodate == 'false'
        run: yarn check:vendored

      - name: Test
        if: steps.target.outputs.uptodate == 'false'
        run: yarn test

      - name: Build
        if: steps.target.outputs.uptodate == 'false'
        run: yarn build

      - name: dist purity invariant
        if: steps.target.outputs.uptodate == 'false'
        run: |
          set -euo pipefail
          fail=0
          for pat in "octokit\|Octokit\|rest\.repos\|rest\.git\|graphql\|@octokit" \
                     "actions-toolkit\|actions/github" \
                     "api\.github\.com"; do
            n=$(grep -c "${pat}" dist/index.js || true)
            echo "pattern '${pat}' -> ${n}"
            [ "${n}" = "0" ] || fail=1
          done
          if [ "${fail}" != "0" ]; then
            echo "::error::dist/index.js contains GitHub API fingerprints. The fork's core property is broken."
            exit 1
          fi

      - name: Open or update the sync pull request
        if: steps.target.outputs.uptodate == 'false'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          Z_TARGET: ${{ steps.target.outputs.target }}
        run: |
          set -euo pipefail
          branch="sync/upstream-${Z_TARGET}"
          git config user.name 'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git checkout -B "${branch}"
          git add -A
          git commit -m "chore: sync with upstream ${Z_TARGET}" || {
            echo "No changes to commit."; exit 0; }
          git push --force origin "${branch}"
          # Idempotent: reuse the existing PR for this tag rather than opening a new one nightly.
          if [ -z "$(gh pr list --head "${branch}" --json number -q '.[].number')" ]; then
            gh pr create --head "${branch}" --base master \
              --title "chore: sync with upstream ${Z_TARGET}" \
              --body "Automated sync. Typecheck, vendored-file check, tests, build and the dist purity invariant all passed."
          fi
```

- [ ] **Step 2: Validate the workflow parses**

Run:

```bash
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.12 -color
```

Expected: no findings. `actionlint` takes no path argument — passing a directory makes it print "is a directory" and exit 0 having linted nothing.

- [ ] **Step 3: Dry-run the tag-selection logic locally**

```bash
git ls-remote --tags --refs upstream 'refs/tags/v*' \
  | awk '{print $2}' | sed 's#refs/tags/##' \
  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1
```

Expected: `v6.2.0`. This must equal the `tag` currently in `.upstream-sync.json`, proving the "already current" path will trigger rather than opening a spurious PR.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/upstream-sync.yml
git commit -m "feat: add the scheduled upstream-sync agent

Deterministic on the happy path: vendor, typecheck, check, test, build, assert
dist purity, open a PR. The typecheck is the tripwire — if upstream reads a
field the shim lacks, compilation fails loudly instead of drifting silently.
Idempotent (reuses the PR for a given tag) and single-flight (concurrency group)."
```

---

### Task 9: Versioning and release wiring

**Files:**
- Create: `.github/workflows/sync-release.yml`
- Modify: `package.json` (remove the broken release scripts)
- Modify: `docs/RELEASE.md`

**Interfaces:**
- Consumes: `.upstream-sync.json`.
- Produces: a release on the fork's own patch line with floating `v6` / `v6.2` maintained.

- [ ] **Step 1: Remove the broken release scripts**

`CLAUDE.md` records that `release:patch`, `release:minor` and `release:major` call a `npm run package` target that does not exist. Delete all three from `package.json` `scripts` so automation cannot reach them.

- [ ] **Step 2: Write the release workflow**

Create `.github/workflows/sync-release.yml`:

```yaml
name: sync-release

on:
  workflow_dispatch:
    inputs:
      version:
        description: 'Fork version to release, e.g. 6.2.1'
        required: true
        type: string

concurrency:
  group: sync-release
  cancel-in-progress: false

permissions:
  contents: read

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - name: Checkout
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
        with:
          fetch-depth: 0

      - name: Validate the version against the mirror rule
        env:
          Z_VERSION: ${{ github.event.inputs.version }}
        run: |
          set -euo pipefail
          upstream_tag=$(node -p "require('./.upstream-sync.json').tag")
          # Rule: fork mirrors upstream MAJOR.MINOR and owns the PATCH.
          want="${upstream_tag#v}"; want="${want%.*}"
          got="${Z_VERSION%.*}"
          if [ "${want}" != "${got}" ]; then
            echo "::error::version ${Z_VERSION} does not mirror upstream ${upstream_tag} MAJOR.MINOR (${want}.x)"
            exit 1
          fi

      - name: Setup Node.js
        uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
        with:
          node-version: '24'

      - name: Install, test, build
        run: |
          yarn install --immutable
          yarn check:vendored
          yarn test
          yarn build

      - name: dist is committed
        run: git diff --exit-code dist/index.js

      - name: Tag and release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          Z_VERSION: ${{ github.event.inputs.version }}
        run: |
          set -euo pipefail
          v="v${Z_VERSION}"
          upstream_tag=$(node -p "require('./.upstream-sync.json').tag")
          upstream_sha=$(node -p "require('./.upstream-sync.json').commit")
          git config user.name 'github-actions[bot]'
          git config user.email 'github-actions[bot]@users.noreply.github.com'
          git tag "${v}"
          major="v${Z_VERSION%%.*}"
          minor="v$(echo "${Z_VERSION}" | cut -d. -f1-2)"
          git tag -f "${major}"; git tag -f "${minor}"
          git push origin "${v}"
          git push -f origin "${major}" "${minor}"
          gh release create "${v}" --title "${v}" --notes \
            "Synced with upstream docker/metadata-action ${upstream_tag} (${upstream_sha})."
```

- [ ] **Step 3: Validate the workflow**

Run:

```bash
docker run --rm -v "$PWD:/repo" --workdir /repo rhysd/actionlint:1.7.12 -color
```

Expected: no findings.

- [ ] **Step 4: Update docs/RELEASE.md**

Replace its contents with the new process:

```markdown
# Release Process

Versioning: the fork mirrors upstream's MAJOR.MINOR and owns the PATCH. Upstream
6.2.x becomes fork 6.2.N. Floating `v6` and `v6.2` are maintained so both remain
drop-in substitutes for `docker/metadata-action`.

To release: run the `sync-release` workflow with the fork version (e.g. `6.2.1`).
It validates the version against the mirror rule, runs the vendored-file check,
tests and build, asserts `dist/` is committed, then tags and releases.

The `release:patch` / `release:minor` / `release:major` npm scripts were removed —
they called a `npm run package` target that never existed.

Which upstream a release corresponds to is recorded in `.upstream-sync.json` and
repeated in the release notes.
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/sync-release.yml package.json docs/RELEASE.md
git commit -m "feat: release wiring for the own-the-patch version scheme

Validates the requested version mirrors upstream MAJOR.MINOR, maintains floating
v6/v6.2 so drop-in substitution keeps working, and records which upstream commit
the release corresponds to. Removes the three release scripts that called a
non-existent npm run package target."
```

---

### Task 10: Supply-chain hardening

Independent of sync, and worth taking on its own merits. This fork is the only repo in the set with no zizmor gate, and its `.yarnrc.yml` lacks three protections upstream now has.

**Files:**
- Modify: `.yarnrc.yml`
- Create: `.github/workflows/zizmor.yml`
- Modify: all files in `.github/workflows/` (pin actions)

**Interfaces:** none.

- [ ] **Step 1: Adopt upstream's yarn hardening**

Add to `.yarnrc.yml`, keeping every existing key:

```yaml
enableHardenedMode: true
enableScripts: false
npmMinimalAgeGate: 2d
```

- [ ] **Step 2: Verify the install still works**

Run: `yarn install --immutable`
Expected: succeeds. If a dependency requires an install script, do **not** re-enable scripts globally — add that one package to `npmPreapprovedPackages` and record why.

- [ ] **Step 3: Add a self-contained zizmor gate**

Upstream uses `crazy-max/.github`'s reusable workflow, which is GitHub-specific. Use the self-contained container step instead. Create `.github/workflows/zizmor.yml`:

```yaml
name: zizmor

on:
  push:
    branches: ['master']
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  zizmor:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6

      - name: Audit workflows for injection and supply-chain issues
        run: |
          docker run --rm -v "$PWD:/repo" ghcr.io/zizmorcore/zizmor:1.30.0 \
            --persona regular --format plain /repo/.github/workflows /repo/action.yml
```

- [ ] **Step 4: Run zizmor locally and fix what it reports**

Run:

```bash
docker run --rm -v "$PWD:/repo" ghcr.io/zizmorcore/zizmor:1.30.0 \
  --persona regular --format plain /repo/.github/workflows /repo/action.yml
```

Fix every finding. The likely one is `unpinned-uses` across roughly 15 refs (`actions/checkout@v6`, `docker/bake-action@v7` and others). Pin each to a SHA with a `# vN` comment, resolving each SHA with:

```bash
gh api repos/actions/checkout/git/ref/tags/v6 -q .object.sha
```

- [ ] **Step 5: Confirm the gate is green**

Run the zizmor command from Step 4 again.
Expected: `No findings to report.`

- [ ] **Step 6: Commit**

```bash
git add .yarnrc.yml .github/workflows/
git commit -m "ci: add supply-chain hardening and a zizmor gate

Adopts the three protections upstream's .yarnrc.yml carries and this fork lacked
(enableHardenedMode, enableScripts: false, npmMinimalAgeGate: 2d), and adds the
zizmor gate this repo had no version of. Uses the self-contained container step
rather than upstream's GitHub-specific reusable workflow. Pins previously
floating action refs."
```

---

### Task 11: Rewrite the process documentation

Deferred to last deliberately: the docs now describe a mechanism that exists.

**Files:**
- Modify: `docs/UPSTREAM_SYNC_RULES.md`
- Modify: `CLAUDE.md`

**Interfaces:** none.

- [ ] **Step 1: Replace the sync mechanism in UPSTREAM_SYNC_RULES.md**

Remove the "being replaced" banner and the manual rebase workflow. Replace the `### Workflow` section with:

```markdown
### Workflow

Syncs are performed by the `upstream-sync` workflow, or locally:

    yarn sync:upstream vX.Y.Z   # vendor the tag and update .upstream-sync.json
    yarn tsc --noEmit           # the tripwire: a missing shim field fails here
    yarn check:vendored         # vendored files still match upstream
    yarn test                   # includes upstream's vendored suite
    yarn build                  # then assert the three-grep invariant

Vendored files are **never hand-edited**. If upstream's engine reads a field the
shim does not supply, extend `src/shims/`, never the vendored file. The one
permitted exception is `__tests__/meta.test.ts`, which carries a single marked
VENDORED-EDIT for the exception list; it is listed under `vendoredWithEdits` in
`.upstream-sync.json` and is re-applied by hand after each sync.
```

- [ ] **Step 2: Update the CLAUDE.md sync and release sections**

Remove the "being replaced" note from the Release Process section. Replace the `## Upstream Sync Process` section body with a pointer to the commands above, and add to `## Critical Constraints`:

```markdown
- **Vendored files are never hand-edited.** `src/meta.ts`, `src/tag.ts`,
  `src/flavor.ts` and `src/image.ts` are upstream's files. `yarn check:vendored`
  fails if they drift. Extend `src/shims/` instead.
```

- [ ] **Step 3: Verify every documented command actually runs**

```bash
yarn check:vendored
yarn tsc --noEmit
yarn test
yarn build
```

Expected: all four succeed. A documented command that does not exist is exactly the failure this repo has already had once, with three committed documents prescribing a flag that was never real.

- [ ] **Step 4: Commit**

```bash
git add docs/UPSTREAM_SYNC_RULES.md CLAUDE.md
git commit -m "docs: document the vendored sync process now that it exists

Replaces the manual-rebase mechanism with the vendor/typecheck/check/test/build
sequence. Every command in the new text was executed before committing."
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: anti-corruption layer → Tasks 1–2; verbatim vendoring → Task 3; vendored suite and exception list → Task 4; golden parity → Task 6; dist purity invariant → Tasks 1, 3, 8; the agent → Task 8; version scheme → Task 9; `bake-target` fix → Task 5; `description`/`licenses` limitation → documented in Task 2's `github-types.ts`; yarn hardening and zizmor → Task 10; doc contradictions → Task 11. Tag-shadowing appears in Task 8 (remote refspec) and Task 7 (`ls-remote` resolution).

**Known gap, stated rather than hidden.** The spec's largest risk — whether upstream's suite compiles against our `Context` — is resolved empirically in Task 4 Step 2 rather than predicted here. If it fails for reasons beyond `description`/`licenses`, Task 4 stops and the shim is extended; the plan does not assume a number of recovered tests, and no task depends on that count.

**Non-goals honoured.** No task migrates ncc → esbuild, changes hosting, touches `publish.yml`/`codeql.yml` beyond pinning, or applies sibling-repo conventions.
