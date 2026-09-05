export class ProbeContext {
  public static tmpDir(): string {
    return process.env.RUNNER_TEMP || '/tmp';
  }
}
