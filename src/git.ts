import simpleGit, {SimpleGit} from 'simple-git';

export interface GitContext {
  sha: string;
  ref: string;
  commitDate: Date;
  remoteUrl?: string;
  defaultBranch: string;
}

export interface Repo {
  name: string;
  description?: string;
  url?: string;
  default_branch: string;
  license?: string;
}

export async function getGitContext(): Promise<GitContext> {
  const git: SimpleGit = simpleGit();

  try {
    // Get current commit SHA
    const sha = await git.revparse(['HEAD']);

    // Get current ref
    let ref = '';
    try {
      // Try to get symbolic ref (branch)
      ref = await git.revparse(['--symbolic-full-name', 'HEAD']);
    } catch {
      // Try to get exact tag
      try {
        const tag = await git.raw(['describe', '--tags', '--exact-match']);
        if (tag) {
          ref = `refs/tags/${tag.trim()}`;
        }
      } catch {
        // Fallback to HEAD
        ref = 'HEAD';
      }
    }

    // Get commit date
    const commitDateStr = await git.show(['-s', '--format=%cI', 'HEAD']);
    const commitDate = commitDateStr ? new Date(commitDateStr.trim()) : new Date();

    // Get remote URL
    let remoteUrl = '';
    try {
      const url = await git.remote(['get-url', 'origin']);
      remoteUrl = url ? url.trim() : '';
    } catch {
      // No remote configured
    }

    // Get default branch
    let defaultBranch = '';
    try {
      const remoteHead = await git.revparse(['--symbolic-full-name', 'refs/remotes/origin/HEAD']);
      if (remoteHead) {
        // Extract branch name from refs/remotes/origin/HEAD -> refs/remotes/origin/main
        defaultBranch = remoteHead.trim().replace(/^refs\/remotes\/origin\//, '');
      }
    } catch {
      // Fallback to common defaults
      try {
        // Try to get default branch from remote
        const branches = await git.branch(['-r']);
        if (branches.all.includes('origin/main')) {
          defaultBranch = 'main';
        } else if (branches.all.includes('origin/master')) {
          defaultBranch = 'master';
        }
      } catch {
        defaultBranch = 'main';
      }
    }

    return {
      sha: sha.trim(),
      ref: ref.trim(),
      commitDate,
      remoteUrl,
      defaultBranch
    };
  } catch (error) {
    throw new Error(`Failed to get git context: ${error.message}`);
  }
}

export function parseRepoFromRemoteUrl(remoteUrl: string, defaultBranch: string): Repo {
  let name = '';
  let url = '';

  if (remoteUrl) {
    // Parse GitHub/GitLab style URLs
    // SSH: git@github.com:user/repo.git
    // HTTPS: https://github.com/user/repo.git
    const sshMatch = remoteUrl.match(/git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    const httpsMatch = remoteUrl.match(/https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/);

    if (sshMatch) {
      const [, host, user, repo] = sshMatch;
      name = repo;
      url = `https://${host}/${user}/${repo}`;
    } else if (httpsMatch) {
      const [, host, user, repo] = httpsMatch;
      name = repo;
      url = `https://${host}/${user}/${repo}`;
    } else {
      // Fallback: use last part of path
      const parts = remoteUrl.split('/');
      name = parts[parts.length - 1].replace(/\.git$/, '');
      url = remoteUrl;
    }
  }

  return {
    name,
    url,
    default_branch: defaultBranch,
    description: '',
    license: ''
  };
}
