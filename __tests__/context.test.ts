import {afterEach, beforeEach, describe, expect, test, it, jest} from '@jest/globals';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import {getContext, getInputs, Inputs} from '../src/context';
import {getGitContext} from '../src/git';

beforeEach(() => {
  jest.clearAllMocks();
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
  test.each([
    [
      0,
      new Map<string, string>([
        ['images', 'moby/buildkit\nghcr.io/moby/mbuildkit'],
      ]),
      {
        bakeTarget: 'docker-metadata-action',
        flavor: [],
        images: ['moby/buildkit', 'ghcr.io/moby/mbuildkit'],
        labels: [],
        annotations: [],
        sepLabels: '\n',
        sepTags: '\n',
        sepAnnotations: '\n',
        tags: [],
      } as Inputs
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
        bakeTarget: 'metadata',
        flavor: [],
        images: ['moby/buildkit'],
        labels: [],
        annotations: [],
        sepLabels: ',',
        sepTags: ',',
        sepAnnotations: ',',
        tags: [],
      } as Inputs
    ],
    [
      2,
      new Map<string, string>([
        ['images', 'moby/buildkit\n#comment\nghcr.io/moby/mbuildkit'],
      ]),
      {
        bakeTarget: 'docker-metadata-action',
        flavor: [],
        images: ['moby/buildkit', 'ghcr.io/moby/mbuildkit'],
        labels: [],
        annotations: [],
        sepLabels: '\n',
        sepTags: '\n',
        sepAnnotations: '\n',
        tags: [],
      } as Inputs
    ],
  ])(
    '[%d] given %p as inputs, returns %p',
    async (num: number, inputs: Map<string, string>, expected: Inputs) => {
      inputs.forEach((value: string, name: string) => {
        setInput(name, value);
      });
      expect(await getInputs()).toEqual(expected);
    }
  );
});

describe('getContext', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ...dotenv.parse(fs.readFileSync(path.join(__dirname, 'fixtures/event_create_branch.env')))
    };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return git context', async () => {
    jest.spyOn(require('../src/git'), 'getGitContext').mockImplementation(async () => {
      return {
        sha: '5f3331d7f7044c18ca9f12c77d961c4d7cf3276a',
        ref: 'refs/heads/dev',
        commitDate: new Date('2024-11-13T13:42:28.000Z'),
        remoteUrl: 'https://github.com/test/repo.git',
        defaultBranch: 'master'
      };
    });

    const context = await getContext();
    expect(context.ref).toEqual('refs/heads/dev');
    expect(context.sha).toEqual('5f3331d7f7044c18ca9f12c77d961c4d7cf3276a');
    expect(context.commitDate).toEqual(new Date('2024-11-13T13:42:28.000Z'));
  });
});

// See: https://github.com/actions/toolkit/blob/master/packages/core/src/core.ts#L67
function getInputName(name: string): string {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
}

function setInput(name: string, value: string): void {
  process.env[getInputName(name)] = value;
}
