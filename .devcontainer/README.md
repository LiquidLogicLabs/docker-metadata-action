# Dev Container

This dev container provides a consistent development environment for the GitHub Action.

## What's Included

- **Node.js 20** - Matches the CI/CD environment
- **Yarn** - Package manager used by this project
- **Git** - Required for integration tests and git operations
- **GitHub CLI** - Optional, useful for GitHub operations
- **VS Code Extensions**:
  - ESLint
  - Prettier
  - TypeScript
  - Jest Runner

## Usage

1. Open the project in VS Code
2. When prompted, click "Reopen in Container"
3. Or use Command Palette: `Dev Containers: Reopen in Container`

## Optional: Install `act` for Local GitHub Actions Testing

To test GitHub Actions workflows locally, you can install `act`:

```bash
# Install act
curl https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash
```

## Available Commands

Once in the container:

```bash
# Install dependencies
yarn install

# Run tests
yarn test

# Lint code
yarn lint

# Format code
yarn format

# Run ESLint
yarn eslint

# Run Prettier
yarn prettier

# Build the action
yarn build
```

## Notes

- The container matches the GitHub Actions runner environment (Node.js 20, Ubuntu)
- Dependencies are automatically installed on container creation using Yarn
- VS Code settings are configured for TypeScript, ESLint, and Prettier
- This action uses Yarn as the package manager (unlike other actions which use npm)

