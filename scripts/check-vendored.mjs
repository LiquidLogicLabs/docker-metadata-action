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

if (!Array.isArray(sync.vendored) || sync.vendored.length === 0) {
  console.error('.upstream-sync.json has no vendored files listed — refusing to report success.');
  process.exit(1);
}

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
