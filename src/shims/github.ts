import * as fs from 'fs';
import {getGitContext, parseRepoFromRemoteUrl} from '../git.js';
import type {Context as MetadataContext} from '../context.js';
import type {GitHubRepo} from './github-types.js';

/**
 * Stands in for `@docker/actions-toolkit/lib/github/github.js`.
 *
 * Upstream's own test suite spies on `GitHub.prototype.repoData` and on the
 * static `context` getter, so both must exist with those exact names for the
 * vendored suite to run. Production code reads through the same seam.
 */
export class GitHub {
  public static get context(): MetadataContext {
    const eventPath = process.env.GITHUB_EVENT_PATH;
    const payload = eventPath && fs.existsSync(eventPath) ? JSON.parse(fs.readFileSync(eventPath, 'utf8')) : {};
    return {
      ref: process.env.GITHUB_REF || '',
      sha: process.env.GITHUB_SHA || '',
      commitDate: new Date(),
      eventName: process.env.GITHUB_EVENT_NAME || '',
      payload
    };
  }

  public async repoData(): Promise<GitHubRepo> {
    const ctx = await getGitContext();
    const repo = parseRepoFromRemoteUrl(ctx.remoteUrl || '', ctx.defaultBranch);
    return {
      name: repo.name,
      default_branch: repo.default_branch,
      html_url: repo.url || '',
      // Neither is obtainable without an API call. See github-types.ts.
      description: '',
      license: null
    };
  }
}
