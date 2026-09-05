import {beforeEach, describe, expect, test, vi} from 'vitest';
import {Context as ToolkitContext} from '../src/shims/toolkit-context.js';
import {GitHub} from '../src/shims/github.js';
import {Toolkit} from '../src/shims/toolkit.js';
import * as git from '../src/git.js';

describe('toolkit shim', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('tmpDir prefers RUNNER_TEMP', () => {
    process.env.RUNNER_TEMP = '/runner-temp';
    expect(ToolkitContext.tmpDir()).toBe('/runner-temp');
  });

  test('tmpDir falls back to the OS temp dir when RUNNER_TEMP is unset', () => {
    delete process.env.RUNNER_TEMP;
    expect(ToolkitContext.tmpDir().length).toBeGreaterThan(0);
  });

  test('repoData maps a git Repo onto the GitHubRepo shape', async () => {
    vi.spyOn(git, 'getGitContext').mockResolvedValue({
      sha: 'abc',
      ref: 'refs/heads/main',
      commitDate: new Date('2020-01-10T00:30:00.000Z'),
      remoteUrl: 'https://github.com/octocat/Hello-World.git',
      defaultBranch: 'main'
    });
    const repo = await new Toolkit().github.repoData();
    expect(repo.name).toBe('Hello-World');
    expect(repo.default_branch).toBe('main');
    expect(repo.html_url).toBe('https://github.com/octocat/Hello-World');
    // Not derivable from git without an API — documented limitation.
    expect(repo.description).toBe('');
    expect(repo.license).toBeNull();
  });

  test('GitHub.context is spy-able, which upstream tests rely on', () => {
    vi.spyOn(GitHub, 'context', 'get').mockReturnValue({
      ref: 'refs/heads/spy',
      sha: 'deadbeef',
      commitDate: new Date('2020-01-10T00:30:00.000Z'),
      eventName: 'push',
      payload: {}
    });
    expect(GitHub.context.ref).toBe('refs/heads/spy');
  });
});
