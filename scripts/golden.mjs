#!/usr/bin/env node
// Runs the BUILT bundle over each scenario and records its outputs, so a sync
// that changes emitted tags/labels is visible as a diff rather than a surprise.
//
// Output normalization: the raw GITHUB_OUTPUT file contains, alongside the
// actual tags/labels/annotations we care about, three values that are
// incidental to *this invocation* rather than to the scenario's inputs:
//   - `@actions/core`'s file-command delimiters (`ghadelimiter_<uuid>`),
//     freshly randomized every run;
//   - the absolute path of this run's own temp directory, embedded in the
//     `bake-file-*` outputs (RUNNER_TEMP is per-invocation by construction,
//     since scenarios must not share state);
//   - `org.opencontainers.image.created`, which is `new Date()` at the
//     moment the (vendored, unmodifiable) action runs — see src/meta.ts.
// None of these can be pinned via scenario env/inputs: the delimiter and the
// timestamp are generated internally with no override, and the temp dir must
// stay unique per run. Left in, they would make every recording differ from
// the last even when nothing about emitted tags/labels changed. So they are
// replaced with fixed placeholders before comparison. This is data cleanup,
// not an assertion: the Vitest test still does a full, unweakened deep-equal
// on the normalized result, and a real change to any other field -- or to
// the shape/presence of these three -- still shows up as a diff.
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
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<TIMESTAMP>');
  results[s.name] = normalized.trim().split('\n').sort();
}

const target = process.argv[2] === '--record' ? '__tests__/golden/expected.json' : '__tests__/golden/actual.json';
writeFileSync(target, JSON.stringify(results, null, 2) + '\n');
console.log(`wrote ${target}`);
