import * as fs from 'fs';
import * as core from '@actions/core';

import {getContext, getInputs, Inputs, Context} from './context';
import {getGitContext, parseRepoFromRemoteUrl, Repo} from './git';
import {Meta, Version} from './meta';

async function run() {
  try {
    const inputs: Inputs = getInputs();
    const context: Context = await getContext();
    const gitContext = await getGitContext();
    const repo: Repo = parseRepoFromRemoteUrl(gitContext.remoteUrl || '', gitContext.defaultBranch);

    await core.group(`Context info`, async () => {
      core.info(`sha: ${context.sha}`);
      core.info(`ref: ${context.ref}`);
      core.info(`commitDate: ${context.commitDate}`);
    });

    const meta: Meta = new Meta(inputs, context, repo);

    const version: Version = meta.version;
    if (meta.version.main == undefined || meta.version.main.length == 0) {
      core.warning(`No Docker image version has been generated. Check tags input.`);
    } else {
      await core.group(`Docker image version`, async () => {
        core.info(version.main || '');
      });
    }
    core.setOutput('version', version.main || '');

    // Docker tags
    const tags: Array<string> = meta.getTags();
    if (tags.length == 0) {
      core.warning('No Docker tag has been generated. Check tags input.');
    } else {
      await core.group(`Docker tags`, async () => {
        for (const tag of tags) {
          core.info(tag);
        }
      });
    }
    core.setOutput('tags', tags.join(inputs.sepTags));

    // Docker labels
    const labels: Array<string> = meta.getLabels();
    await core.group(`Docker labels`, async () => {
      for (const label of labels) {
        core.info(label);
      }
    });
    core.setOutput('labels', labels.join(inputs.sepLabels));

    // Annotations
    const annotationsRaw: Array<string> = meta.getAnnotations();
    const annotationsLevels = process.env.DOCKER_METADATA_ANNOTATIONS_LEVELS || 'manifest';
    await core.group(`Annotations`, async () => {
      const annotations: Array<string> = [];
      for (const level of annotationsLevels.split(',')) {
        annotations.push(
          ...annotationsRaw.map(label => {
            const v = `${level}:${label}`;
            core.info(v);
            return v;
          })
        );
      }
      core.setOutput(`annotations`, annotations.join(inputs.sepAnnotations));
    });

    // JSON
    const jsonOutput = meta.getJSON(annotationsLevels.split(','));
    await core.group(`JSON output`, async () => {
      core.info(JSON.stringify(jsonOutput, null, 2));
    });
    core.setOutput('json', JSON.stringify(jsonOutput));

    // Bake files
    for (const kind of ['tags', 'labels', 'annotations:' + annotationsLevels]) {
      const outputName = kind.split(':')[0];
      const bakeFile: string = meta.getBakeFile(kind);
      await core.group(`Bake file definition (${outputName})`, async () => {
        core.info(fs.readFileSync(bakeFile, 'utf8'));
      });
      core.setOutput(`bake-file-${outputName}`, bakeFile);
    }

    // Bake file with tags and labels
    core.setOutput(`bake-file`, `${meta.getBakeFileTagsLabels()}`);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
