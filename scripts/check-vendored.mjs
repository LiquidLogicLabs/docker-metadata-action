#!/usr/bin/env node
// Asserts every vendored file still matches the upstream content recorded in
// .upstream-sync.json. A vendored file is upstream's file, byte-for-byte.
// Anything else is drift.
//
// This runs OFFLINE by default: it hashes each file in `sync.vendored` and
// compares against the SHA-256 recorded in `sync.hashes` at sync time (the
// one moment network access to upstream is legitimate — see
// vendor-upstream.mjs). No git remote, no fetch, no network of any kind.
//
// An opt-in `--verify-upstream` flag additionally fetches the recorded
// commit from upstream and confirms the recorded hashes genuinely match
// upstream's blobs at that commit. This is a human tool for auditing the
// recorded hashes themselves — it is never run by CI or any workflow, and
// if it can't reach upstream it fails closed (the flag means "prove it").
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const sync = JSON.parse(readFileSync('.upstream-sync.json', 'utf8'));

if (!Array.isArray(sync.vendored) || sync.vendored.length === 0) {
  console.error('.upstream-sync.json has no vendored files listed — refusing to report success.');
  process.exit(1);
}

if (typeof sync.hashes !== 'object' || sync.hashes === null || Array.isArray(sync.hashes)) {
  console.error('.upstream-sync.json has no "hashes" object — refusing to report success.');
  process.exit(1);
}

const missingHashes = sync.vendored.filter(file => typeof sync.hashes[file] !== 'string' || sync.hashes[file].length === 0);
if (missingHashes.length > 0) {
  console.error('The following vendored file(s) have no recorded hash in .upstream-sync.json:');
  for (const file of missingHashes) {
    console.error(`  ${file}`);
  }
  console.error('\nA file with no recorded hash must never be treated as passing — refusing to report success.');
  process.exit(1);
}

function sha256Of(file) {
  return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
}

let failed = 0;

for (const file of sync.vendored) {
  const expected = sync.hashes[file];
  const actual = sha256Of(file);
  if (actual !== expected) {
    console.error(`FAIL ${file}: hash mismatch`);
    console.error(`  expected ${expected}`);
    console.error(`  actual   ${actual}`);
    failed++;
  } else {
    console.log(`ok   ${file}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} vendored file(s) drifted. Vendored files are never hand-edited.`);
  process.exit(1);
}
console.log(`\nAll ${sync.vendored.length} vendored files match the recorded upstream hashes (${sync.tag}).`);

// --- Opt-in online confirmation -------------------------------------------
// Not wired into any workflow. Run by hand: node scripts/check-vendored.mjs --verify-upstream
if (process.argv.includes('--verify-upstream')) {
  const UPSTREAM_URL = 'https://github.com/docker/metadata-action.git';
  console.log(`\nVerifying recorded hashes against upstream ${sync.tag} (${sync.commit}) — this fetches over the network...`);

  function remoteExists(name) {
    try {
      const remotes = execFileSync('git', ['remote'], {encoding: 'utf8'});
      return remotes.split('\n').includes(name);
    } catch {
      return false;
    }
  }

  try {
    if (!remoteExists('upstream')) {
      execFileSync('git', ['remote', 'add', 'upstream', UPSTREAM_URL], {stdio: 'inherit'});
    }
    execFileSync('git', ['fetch', 'upstream', sync.commit], {stdio: 'inherit'});
  } catch (err) {
    console.error(`\n--verify-upstream: could not fetch upstream commit ${sync.commit} — failing closed.`);
    console.error(err.message);
    process.exit(1);
  }

  let onlineFailed = 0;
  for (const file of sync.vendored) {
    let upstreamContent;
    try {
      upstreamContent = execFileSync('git', ['show', `${sync.commit}:${file}`]);
    } catch {
      console.error(`FAIL ${file}: not present at upstream ${sync.commit}`);
      onlineFailed++;
      continue;
    }
    const upstreamHash = `sha256:${createHash('sha256').update(upstreamContent).digest('hex')}`;
    const recordedHash = sync.hashes[file];
    if (upstreamHash !== recordedHash) {
      console.error(`FAIL ${file}: recorded hash does not match upstream ${sync.commit.slice(0, 9)}`);
      console.error(`  recorded ${recordedHash}`);
      console.error(`  upstream ${upstreamHash}`);
      onlineFailed++;
    } else {
      console.log(`ok   ${file}: recorded hash confirmed against upstream`);
    }
  }

  if (onlineFailed > 0) {
    console.error(`\n${onlineFailed} recorded hash(es) do not match upstream. Failing closed.`);
    process.exit(1);
  }
  console.log(`\nAll ${sync.vendored.length} recorded hashes confirmed against upstream ${sync.tag}.`);
}
