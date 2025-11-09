# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.1.5](https://github.com/LiquidLogicLabs/docker-metadata-action/compare/v0.1.4...v0.1.5) (2025-11-09)

### [0.1.4](https://github.com/LiquidLogicLabs/docker-metadata-action/compare/v0.1.3...v0.1.4) (2025-11-09)

### [0.1.3](https://github.com/LiquidLogicLabs/docker-metadata-action/compare/v5.9.0...v0.1.3) (2025-11-09)


### Features

* update action metadata and temporarily disable publish workflow ([6ed148c](https://github.com/LiquidLogicLabs/docker-metadata-action/commit/6ed148c7ef1d5b73782f8c73039bfaf57d9431c0))

### [0.1.2](https://github.com/LiquidLogicLabs/docker-metadata-action/compare/v0.1.1...v0.1.2) (2025-10-15)


### Features

* add automated release system using standard-version ([c3bd111](https://github.com/LiquidLogicLabs/docker-metadata-action/commit/c3bd111d2e904b3249053da9db50a2389daf167f))

## [0.1.0](https://github.com/LiquidLogicLabs/docker-metadata-action/compare/v5.8.0...v0.1.0) (2025-10-15)


### Features

* add documentation skip optimization to CI workflows ([14177d7](https://github.com/LiquidLogicLabs/docker-metadata-action/commit/14177d75e48fcd76abbbc54b4649c6004822ae83))

### [0.1.1](https://github.com/LiquidLogicLabs/docker-metadata-action/compare/v0.1.0...v0.1.1) (2025-10-15)


### Features

* add automated release system using standard-version ([c3bd111](https://github.com/LiquidLogicLabs/docker-metadata-action/commit/c3bd111d2e904b3249053da9db50a2389daf167f))

## [0.1.0] - 2025-01-27

### Added
- Comprehensive documentation updates explaining this fork's purpose
- Clear explanation of differences from the original docker/metadata-action
- Documentation about universal git repository support
- Compatibility and limitations sections in README

### Changed
- Updated all documentation references to use versioned releases instead of @master
- Improved README structure with better organization
- Updated repository URLs to point to LiquidLogicLabs/docker-metadata-action

### Fixed
- Fixed repository URL references to include proper hyphenation
- Corrected version references throughout documentation
- Optimized CI workflows to skip validation for documentation-only changes

### Technical Details
- Fork of docker/metadata-action v5.1.0
- Removed GitHub API dependencies (@actions/github, @docker/actions-toolkit)
- Added git-only implementation using simple-git library
- Maintains full compatibility with original action interface
- Works with any git repository (GitHub, GitLab, Bitbucket, self-hosted)

## [1.0.0] - 2025-01-26

### Added
- Initial fork of docker/metadata-action
- Git-only implementation using simple-git library
- Local testing capabilities
- Universal git repository support

### Removed
- GitHub API dependencies
- GitHub-specific context and event handling
- Dependency on @actions/github and @docker/actions-toolkit

### Changed
- Migrated from GitHub API to direct git commands
- Simplified context extraction using git repository information
- Updated dependencies to remove GitHub-specific packages
