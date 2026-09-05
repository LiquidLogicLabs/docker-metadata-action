import * as core from '@actions/core';
import * as fs from 'fs';

import {getGitContext} from './git.js';

export interface Context {
  ref: string;
  sha: string;
  commitDate: Date;
  eventName: string;
  payload: {
    base_ref?: string;
    repository?: {default_branch?: string};
    pull_request?: {base?: {ref?: string}};
    [key: string]: unknown;
  };
}

export enum ContextSource {
  workflow = 'workflow',
  git = 'git'
}

export interface Inputs {
  context: ContextSource;
  images: string[];
  tags: string[];
  flavor: string[];
  labels: string[];
  annotations: string[];
  sepTags: string;
  sepLabels: string;
  sepAnnotations: string;
  bakeTarget: string;
}

function getInputList(name: string, options?: {ignoreComma?: boolean; comment?: string}): string[] {
  const input = core.getInput(name);
  if (!input) {
    return [];
  }

  const items: string[] = [];
  for (const line of input.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (options?.comment && trimmed.startsWith(options.comment)) {
      continue;
    }
    if (options?.ignoreComma) {
      items.push(trimmed);
    } else {
      items.push(
        ...trimmed
          .split(',')
          .map(item => item.trim())
          .filter(item => item.length > 0)
      );
    }
  }
  return items;
}

export function getInputs(): Inputs {
  const contextInput = (core.getInput('context') || ContextSource.workflow).toLowerCase();
  if (!Object.values(ContextSource).includes(contextInput as ContextSource)) {
    throw new Error(`Invalid context source: ${contextInput}`);
  }
  const tagsInput = getInputList('tags', {ignoreComma: true, comment: '#'});
  const defaultTags = ['type=schedule', 'type=ref,event=branch', 'type=ref,event=tag', 'type=ref,event=pr'];

  return {
    context: contextInput as ContextSource,
    images: getInputList('images', {ignoreComma: true, comment: '#'}),
    tags: tagsInput.length > 0 ? tagsInput : defaultTags,
    flavor: getInputList('flavor', {ignoreComma: true, comment: '#'}),
    labels: getInputList('labels', {ignoreComma: true, comment: '#'}),
    annotations: getInputList('annotations', {ignoreComma: true, comment: '#'}),
    sepTags: core.getInput('sep-tags', {trimWhitespace: false}) || `\n`,
    sepLabels: core.getInput('sep-labels', {trimWhitespace: false}) || `\n`,
    sepAnnotations: core.getInput('sep-annotations', {trimWhitespace: false}) || `\n`,
    bakeTarget: core.getInput('bake-target') || `docker-metadata-action`
  };
}

export async function getContext(source: ContextSource = ContextSource.git): Promise<Context> {
  switch (source) {
    case ContextSource.workflow:
      return await getContextFromWorkflow();
    case ContextSource.git:
      return await getContextFromGit();
    default:
      throw new Error(`Invalid context source: ${source}`);
  }
}

async function getContextFromGit(): Promise<Context> {
  const gitContext = await getGitContext();
  return {
    sha: gitContext.sha,
    ref: gitContext.ref,
    commitDate: gitContext.commitDate,
    eventName: process.env.GITHUB_EVENT_NAME || 'push',
    payload: {
      repository: {default_branch: gitContext.defaultBranch}
    }
  };
}

async function getContextFromWorkflow(): Promise<Context> {
  const rawPayload = loadEventPayload();

  const eventName = process.env.GITHUB_EVENT_NAME || 'workflow';
  // Rule for this function: sha/ref/commitDate/default_branch each fall back
  // to git only when the workflow environment has no equivalent of its own.
  //
  // sha and ref DO have one: GITHUB_SHA and GITHUB_REF, which act and Gitea
  // both populate like a real runner. So they come strictly from the
  // environment (or the event payload below, for pull_request_target /
  // DOCKER_METADATA_PR_HEAD_SHA) and are never backfilled from git — an empty
  // value here honestly means "the workflow did not tell us", and silently
  // substituting the runner's own incidental checkout state (wrong branch,
  // detached HEAD) would fabricate a ref/sha the workflow never gave us.
  //
  // commitDate and default_branch have no such env var. GitHub never exposes
  // either directly — only via the event payload, and not every payload
  // carries them (a `workflow_call` payload is just `{inputs: {...}}`, with
  // no repository object at all). For those two, falling back to git below is
  // a real gap-filler, not a workflow-given value being second-guessed.
  let sha = process.env.GITHUB_SHA || '';
  let ref = process.env.GITHUB_REF || '';

  if (/pull_request_target/.test(eventName) && typeof rawPayload?.number === 'number') {
    ref = `refs/pull/${rawPayload.number}/merge`;
  }

  const pullRequestHeadSha = rawPayload?.pull_request?.head?.sha;
  if (/true/i.test(process.env.DOCKER_METADATA_PR_HEAD_SHA || '') && eventName.includes('pull_request') && pullRequestHeadSha) {
    sha = pullRequestHeadSha;
  }

  // See the rule above. Both fallbacks are lazy and only reached for when the
  // payload is missing the value — never called unconditionally, which is
  // what let git state leak into sha/ref before this fix. commitDate's
  // fallback is documented and tested in __tests__/context.test.ts ("should
  // fall back to git commit date..."); default_branch's fallback has the same
  // justification and its own coverage there ("should fall back to git
  // default branch...").
  const needsGitFallback = !resolveCommitDateFromPayload(rawPayload, sha) || !rawPayload.repository?.default_branch;
  const gitContext = needsGitFallback ? await getGitContext() : undefined;

  const commitDate = resolveCommitDateFromPayload(rawPayload, sha) ?? gitContext?.commitDate ?? new Date();

  const payload: Context['payload'] = {
    ...rawPayload,
    repository: {
      default_branch: rawPayload.repository?.default_branch || gitContext?.defaultBranch
    }
  };

  return {
    sha,
    ref,
    commitDate,
    eventName,
    payload
  };
}

type WorkflowPayload = {
  commits?: Array<{id: string; timestamp: string}>;
  head_commit?: {id: string; timestamp: string};
  pull_request?: {
    head?: {sha?: string};
    base?: {ref?: string};
  };
  repository?: {default_branch?: string};
  base_ref?: string;
  number?: number;
};

function loadEventPayload(): WorkflowPayload {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return {};
  }
  try {
    const content = fs.readFileSync(eventPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    core.debug(`Failed to read workflow event payload from ${eventPath}: ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

function resolveCommitDateFromPayload(payload: WorkflowPayload, sha: string): Date | undefined {
  if (payload.commits) {
    const commit = payload.commits.find(item => item.id === sha);
    if (commit?.timestamp) {
      return new Date(commit.timestamp);
    }
  }
  if (payload.head_commit?.id === sha && payload.head_commit.timestamp) {
    return new Date(payload.head_commit.timestamp);
  }
  return undefined;
}
