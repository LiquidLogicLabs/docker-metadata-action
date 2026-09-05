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
