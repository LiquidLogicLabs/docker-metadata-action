# Release Process

Versioning: the fork mirrors upstream's MAJOR.MINOR and owns the PATCH. Upstream
6.2.x becomes fork 6.2.N. Floating `v6` and `v6.2` are maintained so both remain
drop-in substitutes for `docker/metadata-action`.

To release: run the `sync-release` workflow with the fork version (e.g. `6.2.1`).
It validates the version against the mirror rule, runs the vendored-file check,
tests and build, asserts `dist/` is committed, then tags and releases.

The `release:patch` / `release:minor` / `release:major` npm scripts were removed —
they called a `npm run package` target that never existed. The remaining direct
`standard-version` release scripts (`release`, `release:pre-alpha`, `release:pre-beta`,
`release:pre-rc`, `release:pre-dev`) were also removed: they push tags straight to
origin with none of `sync-release.yml`'s gates (no mirror-rule check, no
`yarn check:vendored`, no tests, no dist-is-committed assertion, no floating tag
maintenance), and the prerelease variants produce suffixed versions (e.g.
`6.2.1-alpha.0`) that this fork's versioning scheme rejects outright, since they
sort before the release they precede.

Which upstream a release corresponds to is recorded in `.upstream-sync.json` and
repeated in the release notes.
