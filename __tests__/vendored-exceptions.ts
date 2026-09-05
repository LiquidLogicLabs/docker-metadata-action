/**
 * Assertions in the vendored upstream suite that cannot pass in a fork making no
 * GitHub API calls, because they assert API-derived label values.
 *
 * GENERATED from an actual failing run, not written by hand. Enumerated case by
 * case, never a wildcard: a broad skip here would become the place failures hide,
 * which is the false-green failure mode — a suite reporting success while
 * checking nothing.
 *
 * The vendored suite itself mocks GitHub.prototype.repoData (see the
 * beforeEach in meta.test.ts) with a fixture that supplies realistic
 * description/license values, so it never actually exercises this shim's
 * real, deliberately-empty repoData() implementation (see
 * src/shims/github-types.ts and __tests__/shims.test.ts). As a result, the
 * observed run produced zero failures and this list is empty.
 */
export const EXCEPTIONS: string[] = [];

export const EXPECTED_EXCEPTION_COUNT = 0;
