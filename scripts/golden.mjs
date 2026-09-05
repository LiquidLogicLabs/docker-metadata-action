#!/usr/bin/env node
// Runs the BUILT bundle over each scenario and records its outputs, so a sync
// that changes emitted tags/labels is visible as a diff rather than a surprise.
//
// Output normalization: the raw GITHUB_OUTPUT file contains, alongside the
// actual tags/labels/annotations we care about, values that are incidental to
// *this invocation* or *this checkout* rather than to the scenario's inputs:
//   - `@actions/core`'s file-command delimiters (`ghadelimiter_<uuid>`),
//     freshly randomized every run;
//   - the absolute path of this run's own temp directory, embedded in the
//     `bake-file-*` outputs (RUNNER_TEMP is per-invocation by construction,
//     since scenarios must not share state);
//   - `org.opencontainers.image.created`, which is `new Date()` at the
//     moment the (vendored, unmodifiable) action runs — see src/meta.ts;
//   - `org.opencontainers.image.source`/`.url`/`.title`, which come from
//     `git remote get-url origin` on whatever checkout runs this script (see
//     src/shims/github.ts::repoData -> src/git.ts::getGitContext /
//     parseRepoFromRemoteUrl) — a maintainer's fork, a Gitea mirror, or any
//     clone with a differently-named or absent `origin` produces a different
//     value here without the action's behavior having changed at all.
// The rule for what belongs in this list: normalize values that are
// properties of the MACHINE running the script, never values that are
// properties of the ACTION's behavior. None of the above can be pinned via
// scenario env/inputs — the delimiter and timestamp are generated internally
// with no override, the temp dir must stay unique per run, and the remote
// URL is a property of the checkout, not an input this action reads. Left
// in, they would make every recording differ from the last, or from another
// checkout's, even when nothing about emitted tags/labels changed. So their
// VALUES are replaced with fixed placeholders before comparison, while the
// label KEYS are left intact — a bug that drops one of these labels, or
// emits it under the wrong key, still shows up as a diff. This is producer-
// side data cleanup, not a weakened assertion: the Vitest test still does a
// full, unweakened deep-equal on the normalized result. Correctness of the
// URL derivation itself is covered separately by __tests__/shims.test.ts.
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

  const normalized = readFileSync(outFile, 'utf8')
    .split(dir)
    .join('<RUNNER_TEMP>')
    .replace(/ghadelimiter_[0-9a-f-]{36}/g, 'ghadelimiter_<uuid>')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<TIMESTAMP>')
    .replace(/(org\.opencontainers\.image\.(?:source|url))=[^\n]*/g, '$1=<REPO_URL>')
    .replace(/(org\.opencontainers\.image\.title)=[^\n]*/g, '$1=<REPO_NAME>')
    .replace(/("org\.opencontainers\.image\.(?:source|url)":")[^"]*(")/g, '$1<REPO_URL>$2')
    .replace(/("org\.opencontainers\.image\.title":")[^"]*(")/g, '$1<REPO_NAME>$2');
  results[s.name] = normalized.trim().split('\n').sort();
}

const target = process.argv[2] === '--record' ? '__tests__/golden/expected.json' : '__tests__/golden/actual.json';
writeFileSync(target, JSON.stringify(results, null, 2) + '\n');
console.log(`wrote ${target}`);
