/**
 * The exact surface upstream's engine reads off a repository. Enumerated by
 * compiling upstream's files against an empty shim, NOT by grep — a grep over
 * `repo.` under-reports, and an earlier one did.
 *
 * `description` and `license` are not derivable from git. They are supplied as
 * empty/null and the corresponding OCI labels are emitted empty. This is a
 * documented, deliberate limitation of a fork that makes no API calls.
 */
export interface GitHubRepo {
  name: string;
  description: string;
  html_url: string;
  // An OBJECT, not a string: upstream's engine reads `repo.license?.spdx_id`.
  // The GitHub API returns {key, name, spdx_id, url, node_id}; only spdx_id is read.
  license: {spdx_id: string} | null;
  default_branch: string;
}
