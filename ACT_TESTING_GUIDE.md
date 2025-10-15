# Local Testing with Act

This guide explains how to test the GitHub Action locally using [act](https://github.com/nektos/act).

## What is Act?

Act is a tool that allows you to run GitHub Actions workflows locally using Docker containers. This lets you test your action before pushing to GitHub, saving time and avoiding unnecessary commits.

## Installation

### macOS
```bash
brew install act
```

### Linux
```bash
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

### Windows
```bash
choco install act-cli
```

### Docker Required
Act uses Docker to run workflows. Make sure Docker is installed and running:
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (macOS/Windows)
- [Docker Engine](https://docs.docker.com/engine/install/) (Linux)

## Quick Start

```bash
# Run all tests
./act-build.sh

# The script will:
# 1. Build the action (npm install && npm run build)
# 2. Run test workflows using act
# 3. Show results
```

## Available Tests

The script is flexible and works with any workflow and job:

```bash
# Run common tests (default - no arguments)
./act-build.sh

# Run specific job from any workflow
./act-build.sh ci.yml context           # Run 'context' job from ci.yml
./act-build.sh ci.yml multi-images      # Run 'multi-images' job from ci.yml
./act-build.sh test.yml test            # Run 'test' job from test.yml

# Run all jobs in a workflow
./act-build.sh ci.yml                   # Run all jobs in ci.yml
./act-build.sh test.yml                 # Run all jobs in test.yml
./act-build.sh validate.yml             # Run all jobs in validate.yml

# Backward compatibility (assumes ci.yml)
./act-build.sh context                  # Same as: ./act-build.sh ci.yml context
./act-build.sh flavor                   # Same as: ./act-build.sh ci.yml flavor

# Specify event type
./act-build.sh ci.yml context push      # Run with push event
./act-build.sh ci.yml schedule schedule # Run with schedule event

# List all available workflows and jobs
./act-build.sh list

# Show help and examples
./act-build.sh help
```

### Discovering Jobs

To see what jobs are available:

```bash
# List all workflows and their jobs
./act-build.sh list

# Or use act directly
act -l                                  # List all jobs from all workflows
act -W .github/workflows/ci.yml -l     # List jobs from ci.yml
```

## Test Jobs from CI Workflow

The main testing happens in `.github/workflows/ci.yml` which contains comprehensive test jobs:

### 1. Context Test (`context`)
Tests both workflow and git context modes:
- Workflow context (GitHub Actions environment)
- Git context (direct git commands)

### 2. Multiple Images Test (`multi-images`)
Tests with multiple registries:
- Multiple images (Docker Hub and GHCR)
- Various tag types
- SHA tags

### 3. Flavor Test (`flavor`)
Tests prefix/suffix functionality:
- Custom prefix
- Custom suffix
- Tag transformations

### 4. Semver Test (`semver`)
Tests semantic versioning:
- Version pattern matching
- Major.minor.patch extraction
- Latest tag behavior

### 5. Custom Labels and Annotations (`labels`)
Tests custom metadata:
- Custom labels
- Custom annotations
- OCI standard fields

### 6. And Many More
The CI workflow includes additional comprehensive tests for:
- Match patterns
- Schedule tags
- Global expressions
- JSON output
- Bake file generation
- Docker build integration

## Configuration

Act uses your global configuration from `~/.actrc`. If you need project-specific configuration, you can create a local `.actrc` file in the project root.

Recommended act configuration:
```bash
# Use medium-sized runner image
-P ubuntu-latest=catthehacker/ubuntu:act-latest

# Container architecture
--container-architecture linux/amd64

# Detect event from git context
--detect-event
```

## Running Act Directly

You can also run act commands directly:

```bash
# Run a specific job
act -j test-branch -W .github/workflows/test-local.yml

# Run with verbose output
act -v -j test-branch -W .github/workflows/test-local.yml

# List available workflows
act -l

# Dry run (don't actually run, just show what would run)
act -n -j test-branch -W .github/workflows/test-local.yml
```

## Common Issues

### Port Already in Use
If you see "port already allocated" errors:
```bash
# Stop any running act containers
docker ps | grep act | awk '{print $1}' | xargs docker stop
```

### Image Pull Errors
If Docker images fail to download:
```bash
# Pull the image manually
docker pull catthehacker/ubuntu:act-latest
```

### Permission Errors
If you see permission errors on Linux:
```bash
# Add your user to docker group
sudo usermod -aG docker $USER
# Then log out and back in
```

### Out of Disk Space
Act creates containers that can consume disk space:
```bash
# Clean up stopped containers
docker container prune -f

# Clean up unused images
docker image prune -a -f
```

## Understanding Output

Act output includes:
- `::group::` / `::endgroup::` - Collapsible log sections
- `::set-output name=...::` - Action outputs being set
- Container logs - Docker container execution details

### Example Output
```
[Simple branch test/test-branch] 🚀  Start image=catthehacker/ubuntu:act-latest
[Simple branch test/test-branch]   🐳  docker pull image=catthehacker/ubuntu:act-latest platform= username= forcePull=false
[Simple branch test/test-branch]   🐳  docker create image=catthehacker/ubuntu:act-latest platform= entrypoint=["/usr/bin/tail" "-f" "/dev/null"] cmd=[]
[Simple branch test/test-branch]   🐳  docker run image=catthehacker/ubuntu:act-latest platform= entrypoint=["/usr/bin/tail" "-f" "/dev/null"] cmd=[]
[Simple branch test/test-branch] ⭐ Run Main Checkout
[Simple branch test/test-branch] ⭐ Run Main Docker metadata (simple)
::group::Context info
sha: 032a4b3bda1b716928481836ac5bfe36e1feaad6
ref: refs/heads/master
commitDate: Wed Aug 20 2025 08:27:56 GMT-0400 (Eastern Daylight Time)
::endgroup::
::set-output name=version::master
::set-output name=tags::myorg/myapp:master%0Amyorg/myapp:sha-032a4b3
```

## Debugging

### Enable Verbose Mode
```bash
# Edit act-build.sh and add -v flag to act commands
act -v -W ".github/workflows/test-local.yml" -j "$job"
```

### Check Action Outputs
```bash
# The workflow includes steps that print outputs
# Look for "Show outputs" steps in the output
```

### Interactive Shell
```bash
# Drop into a shell inside the act container
act -j test-branch --shell bash
```

## Best Practices

1. **Build First**: Always build before testing
   ```bash
   npm install && npm run build
   ```

2. **Test Incrementally**: Test one scenario at a time during development
   ```bash
   ./act-build.sh simple
   ```

3. **Check Git State**: Act reads your current git state, so:
   - Commit or stash changes before testing
   - Test on the actual branch you want to simulate

4. **Clean Up**: Regularly clean up Docker resources
   ```bash
   docker system prune -f
   ```

5. **Keep Workflows Simple**: Test workflows should be focused and fast

## CI/CD Integration

While act is for local testing, remember to:
1. Test locally with act before pushing
2. Let GitHub Actions run the full test suite on push
3. Use act for quick iteration during development
4. Use GitHub Actions for comprehensive CI/CD

## Resources

- [Act Documentation](https://github.com/nektos/act)
- [Act Runner Images](https://github.com/catthehacker/docker_images)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Documentation](https://docs.docker.com/)

## Troubleshooting

If you encounter issues:

1. **Check act version**: `act --version` (should be v0.2.50+)
2. **Check Docker**: `docker --version` and `docker ps`
3. **Check build**: `npm run build` should complete without errors
4. **Check git**: Make sure you're in a git repository
5. **Check logs**: Add `-v` flag for verbose output

## Getting Help

If you need help:
- File an issue in this repository
- Check [act issues](https://github.com/nektos/act/issues)
- Review [GitHub Actions documentation](https://docs.github.com/en/actions)

