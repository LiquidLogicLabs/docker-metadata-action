# Ultra-Simple Release Automation 🚀

The **simplest possible** release automation using `npx` and existing tools.

## ⚡ **One-Line Releases**

### **Method 1: One-Line Release Commands (Recommended)**

```bash
# Full Releases (creates tag, triggers CI/CD pipeline)
npm run release:patch      # v0.1.0 → v0.1.1 (bug fixes)
npm run release:minor      # v0.1.0 → v0.2.0 (new features)
npm run release:major      # v0.1.0 → v1.0.0 (breaking changes)

# Pre-Releases (creates pre-release tag, triggers CI/CD pipeline)
npm run release:pre-alpha  # v0.1.0 → v0.1.1-alpha.0
npm run release:pre-beta   # v0.1.0 → v0.1.1-beta.0
npm run release:pre-rc     # v0.1.0 → v0.1.1-rc.0
npm run release:pre-dev    # v0.1.0 → v0.1.1-dev.0

# Interactive mode (asks what type)
npm run release
```

**That's it!** Commands create git tags which automatically trigger the CI/CD pipeline for testing, building, packaging, and releasing.

### **Method 2: Direct standard-version**

```bash
# Direct standard-version commands
npx standard-version --release-as patch   # 0.1.0 → 0.1.1
npx standard-version --release-as minor   # 0.1.0 → 0.2.0  
npx standard-version --release-as major   # 0.1.0 → 1.0.0
npx standard-version                       # Interactive mode
```

## 🎯 **What Happens Automatically**

When you run any of the above commands:

1. ✅ **Version Detection**: Reads current version from git tags
2. ✅ **Version Bump**: Calculates next version (patch/minor/major)
3. ✅ **Changelog**: Generates changelog from conventional commits
4. ✅ **Package Update**: Updates package.json version
5. ✅ **Git Commit**: Commits changes with proper message
6. ✅ **Git Tag**: Creates version tag (e.g., v0.1.1)
7. ✅ **Push**: Pushes commits and tags to GitHub
8. ✅ **GitHub Release**: GitHub Actions creates the release automatically

## 📋 **Commit Message Format**

Use conventional commits for automatic changelog generation:

```bash
# Bug fixes (creates patch release)
git commit -m "fix: resolve git context extraction issue"

# New features (creates minor release)
git commit -m "feat: add support for GitLab repositories"

# Breaking changes (creates major release)  
git commit -m "feat!: change input parameter names"

# Documentation
git commit -m "docs: update README with new examples"

# Chores (hidden in changelog)
git commit -m "chore: update dependencies"
```

## 🏗️ **System Architecture**

```
┌─────────────────────────────────────────────────────────────┐
│                ULTRA-SIMPLE RELEASE FLOW                   │
└─────────────────────────────────────────────────────────────┘

Developer Flow:
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Commit    │───▶│ npx release  │───▶│   GitHub    │
│ Conventional│    │ command      │    │   Release   │
└─────────────┘    └──────────────┘    └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Auto-changelog│
                    │ Auto-version  │
                    │ Auto-tag      │
                    └──────────────┘
```

## 🛠️ **Tools Used**

- **[standard-version](https://github.com/conventional-changelog/standard-version)**: Industry-standard release automation
- **[conventional-changelog](https://github.com/conventional-changelog/conventional-changelog)**: Automatic changelog generation
- **[npx](https://www.npmjs.com/package/npx)**: Run packages without installation
- **GitHub Actions**: Automated release creation

## 📚 **Usage Examples**

### **Creating a Bug Fix Release**

```bash
# 1. Fix the bug and commit
git commit -m "fix: resolve git remote URL parsing error"

# 2. Create patch release
npm run release:patch

# Result: v0.1.0 → v0.1.1
# ✅ Changelog updated
# ✅ GitHub release created
# ✅ Documentation updated with new version
```

### **Creating a Feature Release**

```bash
# 1. Add feature and commit
git commit -m "feat: add support for Bitbucket repositories"

# 2. Create minor release
npm run release:minor

# Result: v0.1.1 → v0.2.0
# ✅ Changelog updated with new feature
# ✅ GitHub release created
# ✅ Documentation updated with new version
```

### **Creating a Breaking Change Release**

```bash
# 1. Make breaking change and commit
git commit -m "feat!: rename images input to image-list"

# 2. Create major release
npm run release:major

# Result: v0.2.0 → v1.0.0
# ✅ Changelog updated with breaking changes
# ✅ GitHub release created
# ✅ Documentation updated with new version
```

## 🎨 **Generated Changelog Example**

```markdown
# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2025-01-27

### Features

- add support for Bitbucket repositories (a1b2c3d)
- add enhanced git context extraction (e4f5g6h)

### Bug Fixes

- resolve git remote URL parsing error (i7j8k9l)

## [0.1.1] - 2025-01-26

### Bug Fixes

- fix git context extraction issue (m1n2o3p)
```

## ⚙️ **Configuration**

### **Package.json Scripts**

```json
{
  "scripts": {
    "release": "standard-version --release-as patch && git push --follow-tags origin HEAD",
    "release:patch": "standard-version --release-as patch && git push --follow-tags origin HEAD",
    "release:minor": "standard-version --release-as minor && git push --follow-tags origin HEAD", 
    "release:major": "standard-version --release-as major && git push --follow-tags origin HEAD"
  }
}
```

### **GitHub Actions Integration**

The existing `.github/workflows/publish.yml` automatically:
- ✅ Creates GitHub releases when tags are pushed
- ✅ Updates major version tags (v0, v1, etc.)
- ✅ Generates release notes from changelog

## 🎯 **Benefits**

- ✅ **Zero Setup**: No installation required
- ✅ **Industry Standard**: Uses proven tools
- ✅ **Automatic**: Changelog, versioning, releases
- ✅ **Reliable**: No custom bugs or edge cases
- ✅ **Flexible**: Works with any conventional commit format
- ✅ **Fast**: Single command does everything

## 🆘 **Troubleshooting**

### **"npx not found"**
```bash
# Install Node.js (includes npx)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### **"No commits found"**
```bash
# Make sure you have conventional commits
git log --oneline -5
# Should see: feat:, fix:, docs:, etc.
```

### **"GitHub release not created"**
```bash
# Check GitHub Actions workflow
# Should trigger automatically on tag push
```

## 🎉 **Summary**

**Ultra-simple release automation in one command:**

```bash
npx standard-version --release-as patch
```

**That's it!** 🚀

- No installation
- No setup  
- No bugs
- Just works
