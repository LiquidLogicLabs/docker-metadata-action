import {afterEach, beforeEach, describe, expect, test, it, vi} from 'vitest';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import {ContextSource, getContext, getInputs, Inputs} from '../src/context.js';
import * as gitModule from '../src/git.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getInputs', () => {
  beforeEach(() => {
    process.env = Object.keys(process.env).reduce((object, key) => {
      if (!key.startsWith('INPUT_')) {
        object[key] = process.env[key];
      }
      return object;
    }, {});
  });

  // prettier-ignore
  const cases: [number, Map<string, string>, Inputs][] = [
    [
      0,
      new Map<string, string>([
        ['images', 'moby/buildkit\nghcr.io/moby/mbuildkit'],
      ]),
      {
        context: ContextSource.workflow,
        bakeTarget: 'docker-metadata-action',
        flavor: [],
        images: ['moby/buildkit', 'ghcr.io/moby/mbuildkit'],
        labels: [],
        annotations: [],
        sepLabels: '\n',
        sepTags: '\n',
        sepAnnotations: '\n',
        tags: [
          'type=schedule',
          'type=ref,event=branch',
          'type=ref,event=tag',
          'type=ref,event=pr'
        ],
      }
    ],
    [
      1,
      new Map<string, string>([
        ['bake-target', 'metadata'],
        ['images', 'moby/buildkit'],
        ['sep-labels', ','],
        ['sep-tags', ','],
        ['sep-annotations', ',']
      ]),
      {
        context: ContextSource.workflow,
        bakeTarget: 'metadata',
        flavor: [],
        images: ['moby/buildkit'],
        labels: [],
        annotations: [],
        sepLabels: ',',
        sepTags: ',',
        sepAnnotations: ',',
        tags: [
          'type=schedule',
          'type=ref,event=branch',
          'type=ref,event=tag',
          'type=ref,event=pr'
        ],
      }
    ],
    [
      2,
      new Map<string, string>([
        ['images', 'moby/buildkit\n#comment\nghcr.io/moby/mbuildkit'],
      ]),
      {
        context: ContextSource.workflow,
        bakeTarget: 'docker-metadata-action',
        flavor: [],
        images: ['moby/buildkit', 'ghcr.io/moby/mbuildkit'],
        labels: [],
        annotations: [],
        sepLabels: '\n',
        sepTags: '\n',
        sepAnnotations: '\n',
        tags: [
          'type=schedule',
          'type=ref,event=branch',
          'type=ref,event=tag',
          'type=ref,event=pr'
        ],
      }
    ],
    [
      3,
      new Map<string, string>([
        ['labels', 'mylabel=foo#bar\n#comment\nanother=bar'],
      ]),
      {
        context: ContextSource.workflow,
        bakeTarget: 'docker-metadata-action',
        flavor: [],
        images: [],
        labels: ['mylabel=foo#bar', 'another=bar'],
        annotations: [],
        sepLabels: '\n',
        sepTags: '\n',
        sepAnnotations: '\n',
        tags: [
          'type=schedule',
          'type=ref,event=branch',
          'type=ref,event=tag',
          'type=ref,event=pr'
        ],
      }
    ],
    [
      4,
      new Map<string, string>([
        ['annotations', 'org.opencontainers.image.url=https://example.com/path#readme\n#comment\norg.opencontainers.image.source=https://github.com/docker/metadata-action'],
      ]),
      {
        context: ContextSource.workflow,
        bakeTarget: 'docker-metadata-action',
        flavor: [],
        images: [],
        labels: [],
        annotations: [
          'org.opencontainers.image.url=https://example.com/path#readme',
          'org.opencontainers.image.source=https://github.com/docker/metadata-action'
        ],
        sepLabels: '\n',
        sepTags: '\n',
        sepAnnotations: '\n',
        tags: [
          'type=schedule',
          'type=ref,event=branch',
          'type=ref,event=tag',
          'type=ref,event=pr'
        ],
      }
    ],
    [
      5,
      new Map<string, string>([
        ['tags', 'type=raw,value=foo#bar\n#comment'],
        ['flavor', 'prefix=v#1\n#comment'],
      ]),
      {
        context: ContextSource.workflow,
        bakeTarget: 'docker-metadata-action',
        flavor: ['prefix=v#1'],
        images: [],
        labels: [],
        annotations: [],
        sepLabels: '\n',
        sepTags: '\n',
        sepAnnotations: '\n',
        tags: ['type=raw,value=foo#bar'],
      }
    ],
  ];
  test.each(cases)('[%d] given %o as inputs, returns %o', (num: number, inputs: Map<string, string>, expected: Inputs) => {
    inputs.forEach((value: string, name: string) => {
      setInput(name, value);
    });
    expect(getInputs()).toEqual(expected);
  });
});

describe('getContext', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      ...dotenv.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures/event_create_branch.env')))
    };
  });
  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should return git context', async () => {
    vi.spyOn(gitModule, 'getGitContext').mockImplementation(async () => {
      return {
        sha: '5f3331d7f7044c18ca9f12c77d961c4d7cf3276a',
        ref: process.env.GITHUB_REF || 'refs/heads/dev',
        commitDate: new Date('2024-11-13T13:42:28.000Z'),
        remoteUrl: 'https://github.com/test/repo.git',
        defaultBranch: 'master'
      };
    });

    const context = await getContext(ContextSource.git);
    expect(context.ref).toEqual('refs/heads/dev');
    expect(context.sha).toEqual('5f3331d7f7044c18ca9f12c77d961c4d7cf3276a');
    expect(context.commitDate).toEqual(new Date('2024-11-13T13:42:28.000Z'));
  });

  it('should fall back to git commit date when workflow payload missing', async () => {
    vi.spyOn(gitModule, 'getGitContext').mockImplementation(async () => {
      return {
        sha: 'payload-sha',
        ref: 'refs/heads/workflow-branch',
        commitDate: new Date('2022-01-01T00:00:00.000Z'),
        remoteUrl: 'https://github.com/test/repo.git',
        defaultBranch: 'main'
      };
    });
    process.env.GITHUB_SHA = 'payload-sha';
    process.env.GITHUB_REF = 'refs/heads/workflow-branch';
    delete process.env.GITHUB_EVENT_PATH;
    const context = await getContext(ContextSource.workflow);
    expect(context.ref).toEqual('refs/heads/workflow-branch');
    expect(context.sha).toEqual('payload-sha');
    expect(context.commitDate).toEqual(new Date('2022-01-01T00:00:00.000Z'));
  });
});

// See: https://github.com/actions/toolkit/blob/master/packages/core/src/core.ts#L67
function getInputName(name: string): string {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
}

function setInput(name: string, value: string): void {
  process.env[getInputName(name)] = value;
}
