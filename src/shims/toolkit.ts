import {GitHub} from './github.js';

/**
 * Stands in for `@docker/actions-toolkit/lib/toolkit.js`. Upstream's tests
 * construct `new Toolkit()` and reach `toolkit.github.repoData()`; that path is
 * the whole of the surface they use.
 */
export class Toolkit {
  public github: GitHub;

  constructor() {
    this.github = new GitHub();
  }
}
