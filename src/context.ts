import * as core from '@actions/core';
import {getGitContext, GitContext} from './git';

export interface Context {
  sha: string;
  ref: string;
  commitDate: Date;
  eventName: string;
}

export interface Inputs {
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
  const tagsInput = getInputList('tags', {ignoreComma: true, comment: '#'});
  const defaultTags = [
    'type=schedule',
    'type=ref,event=branch',
    'type=ref,event=tag',
    'type=ref,event=pr'
  ];
  
  return {
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

export async function getContext(): Promise<Context> {
  const gitContext: GitContext = await getGitContext();
  return {
    sha: gitContext.sha,
    ref: gitContext.ref,
    commitDate: gitContext.commitDate,
    eventName: process.env.GITHUB_EVENT_NAME || 'push'
  };
}
