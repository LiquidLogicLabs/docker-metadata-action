# Tests Update Required

The test suite in `__tests__/` still uses GitHub Actions mocks and fixtures. The tests need to be updated to work with the new CLI interface.

## Current Test Structure

The tests currently use:
- `__mocks__/@actions/github.ts` - Mocks GitHub Actions context
- `__tests__/fixtures/` - JSON and ENV files simulating GitHub events (push, tag, PR, etc.)
- Jest tests that import and call functions directly

## Required Changes

### 1. Remove GitHub Actions Mocks
- Delete `__mocks__/@actions/github.ts`
- Remove any other `__mocks__/@actions/` files

### 2. Mock Git Commands
Create new mocks for git command execution:
- Mock `execSync` in `src/git.ts`
- Create test fixtures that return git command outputs instead of GitHub events

### 3. Update Test Fixtures
Current fixtures simulate GitHub webhook events. New fixtures should simulate:
- Git command outputs (SHA, ref, commit date, remote URL)
- Different git states (branches, tags, detached HEAD)

Example fixture structure:
```typescript
{
  gitCommands: {
    'git rev-parse HEAD': '032a4b3bda1b716928481836ac5bfe36e1feaad6',
    'git symbolic-ref HEAD': 'refs/heads/master',
    'git log -1 --format=%cI': '2024-01-15T10:30:00Z',
    'git config --get remote.origin.url': 'https://github.com/user/repo.git',
    'git symbolic-ref refs/remotes/origin/HEAD': 'refs/remotes/origin/main'
  },
  expectedOutputs: {
    version: 'master',
    tags: ['repo:master', 'repo:sha-032a4b3'],
    labels: {...}
  }
}
```

### 4. Update Test Files

#### `__tests__/context.test.ts`
- Remove tests for GitHub workflow context
- Add tests for git context extraction
- Add tests for CLI argument parsing
- Mock git command execution

#### `__tests__/meta.test.ts`
- Update to use git-based context
- Update expected outputs (no GitHub-specific fields)
- Mock git commands for different scenarios

#### `__tests__/tag.test.ts`
- Should mostly work as-is since tag logic is independent
- May need minor updates for context structure

#### `__tests__/flavor.test.ts`
- Should work as-is since flavor logic is independent

#### `__tests__/image.test.ts`
- Should work as-is since image logic is independent

### 5. Add New CLI-Specific Tests

Create new tests for:
- CLI argument parsing
- Error handling for invalid arguments
- Output format validation
- Git command failure scenarios

### 6. Integration Tests

Add integration tests that:
- Actually run git commands in a test repository
- Verify end-to-end CLI functionality
- Test different git states (branches, tags, commits)

## Example Test Update

**Before (GitHub Actions)**:
```typescript
test('push on master branch', async () => {
  process.env = {
    ...process.env,
    GITHUB_REPOSITORY: 'user/repo',
    GITHUB_REF: 'refs/heads/master'
  };
  // ... test logic
});
```

**After (Git CLI)**:
```typescript
test('git branch master', async () => {
  jest.spyOn(childProcess, 'execSync').mockImplementation((cmd) => {
    if (cmd.includes('git rev-parse HEAD')) return 'abc123';
    if (cmd.includes('git symbolic-ref HEAD')) return 'refs/heads/master';
    // ... other git commands
  });
  // ... test logic
});
```

## Running Tests

After updating tests, verify with:
```bash
npm test
```

## Coverage

Ensure test coverage remains high for:
- Git context extraction
- Tag generation logic
- Label/annotation generation
- Error handling
- Edge cases (detached HEAD, no remote, etc.)

## Notes

- The core business logic (tag parsing, version generation, label creation) remains unchanged
- Most test failures will be due to context structure changes, not logic changes
- Consider using a test fixture builder to make test setup easier
- Git command mocking should be centralized in a test utility

