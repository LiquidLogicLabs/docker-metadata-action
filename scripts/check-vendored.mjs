#!/usr/bin/env node
// Asserts every vendored file still matches the upstream commit recorded in
// .upstream-sync.json. A vendored file is upstream's file, byte-for-byte.
// Anything else is drift.
//
// This must work in a FRESH clone that has never fetched the `upstream`
// remote — e.g. CI, where actions/checkout only fetches origin. If the
// recorded commit object is not present locally, fetch it by SHA before
// comparing. Fetching by SHA (not `git fetch --tags`) matters: this fork's
// own release tags (v6, v6.0.0, ...) share names with upstream's, so a
// tag-fetch fails with "would clobber existing tag" and aborts the whole
// check with a false "drift" verdict.
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const UPSTREAM_URL = 'https://github.com/docker/metadata-action.git';

const sync = JSON.parse(readFileSync('.upstream-sync.json', 'utf8'));

if (!Array.isArray(sync.vendored) || sync.vendored.length === 0) {
  console.error('.upstream-sync.json has no vendored files listed — refusing to report success.');
  process.exit(1);
}

function commitAvailable(commit) {
  try {
    execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], {stdio: 'ignore'});
    return true;
  } catch {
    return false;
  }
}

function remoteExists(name) {
  try {
    const remotes = execFileSync('git', ['remote'], {encoding: 'utf8'});
    return remotes.split('\n').includes(name);
  } catch {
    return false;
  }
}

if (!commitAvailable(sync.commit)) {
  if (!remoteExists('upstream')) {
    execFileSync('git', ['remote', 'add', 'upstream', UPSTREAM_URL], {stdio: 'inherit'});
  }
  try {
    execFileSync('git', ['fetch', 'upstream', sync.commit], {stdio: 'inherit'});
  } catch {
    // fall through to the availability check below, which reports the error.
  }
}

if (!commitAvailable(sync.commit)) {
  console.error(`Could not obtain upstream commit ${sync.commit} — cannot verify vendored files.`);
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
