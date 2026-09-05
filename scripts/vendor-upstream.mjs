#!/usr/bin/env node
// Performs a sync: resolve the upstream tag, copy the vendored file set, update
// the pointer. Deliberately does NOT run tests or commit — the caller gates on
// those, so this script has exactly one job.
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error('usage: vendor-upstream.mjs vX.Y.Z');
  process.exit(2);
}

// Resolve via ls-remote: the LOCAL tag of the same name is the fork's own and
// shadows upstream's. Using it would silently vendor the fork's own files.
// Query both the plain ref and its peeled (^{}) form: upstream's tags are
// lightweight (no peeled entries at all as of v6.2.0), so `^{}` alone never
// resolves. Prefer the peeled entry when present (annotated tag), otherwise
// use the plain ref (lightweight tag, which is what upstream actually uses).
const out = execFileSync('git', ['ls-remote', 'upstream', `refs/tags/${tag}`, `refs/tags/${tag}^{}`], {encoding: 'utf8'}).trim();
const lines = out.split('\n').filter(Boolean);
const peeled = lines.find(line => line.endsWith('^{}'));
const plain = lines.find(line => line.endsWith(`refs/tags/${tag}`));
const commit = (peeled || plain || '').split(/\s+/)[0];
if (!commit || commit.length !== 40) {
  console.error(`could not resolve upstream ${tag} to a commit`);
  process.exit(1);
}

// Fetch the resolved commit by SHA rather than `git fetch upstream --tags`.
// This fork keeps its own release tags (v6, v6.0.0, ...) that mirror
// upstream's MAJOR.MINOR names but point at different commits; `--tags`
// tries to update those local refs to match upstream and git refuses
// (would clobber existing tag), failing the whole fetch. Fetching by SHA
// pulls in exactly the object we need without touching any local ref.
execFileSync('git', ['fetch', 'upstream', commit], {stdio: 'inherit'});

const sync = JSON.parse(readFileSync('.upstream-sync.json', 'utf8'));
const files = [...sync.vendored, ...(sync.vendoredWithEdits || [])];

// Hashes are recorded only for files in `vendored` (byte-identical to
// upstream, checked offline by check-vendored.mjs). Files in
// `vendoredWithEdits` are expected to diverge from upstream by design (see
// .upstream-sync.json), so no hash is recorded for them.
const hashes = {};

for (const file of files) {
  // No {encoding: 'utf8'} here: this must be a byte-for-byte copy of
  // upstream's blob, not a decode/re-encode round-trip. Decoding to a JS
  // string and writing it back can silently corrupt content that doesn't
  // round-trip through UTF-8 (invalid sequences replaced with U+FFFD, BOM
  // handling, etc.), which would make the recorded hash certify corrupted
  // bytes as correct. execFileSync with no `encoding` returns a Buffer.
  const content = execFileSync('git', ['show', `${commit}:${file}`]);
  writeFileSync(file, content);
  console.log(`vendored ${file}`);
  if (sync.vendored.includes(file)) {
    // Hash the exact bytes just written to disk (the same Buffer), not a
    // re-read or re-decoded form — they must be the same bytes
    // check-vendored.mjs reads back later.
    hashes[file] = `sha256:${createHash('sha256').update(content).digest('hex')}`;
  }
}

sync.tag = tag;
sync.commit = commit;
sync.syncedAt = new Date().toISOString();
sync.hashes = hashes;
writeFileSync('.upstream-sync.json', JSON.stringify(sync, null, 2) + '\n');
console.log(`\npointer updated to ${tag} (${commit.slice(0, 9)})`);
if ((sync.vendoredWithEdits || []).length > 0) {
  console.log('NOTE: files in vendoredWithEdits were overwritten and their permitted');
  console.log('edits must be re-applied by hand before the suite will pass.');
}
