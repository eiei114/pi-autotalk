# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.1.4] - 2026-07-04

### Fixed

- Publish pipeline: removed `registry-url` from `setup-node` in `.github/workflows/publish.yml`
  so `npm publish --provenance` uses the OIDC token for both provenance signing and HTTP
  authentication. Previously `NODE_AUTH_TOKEN` (set to GITHUB_TOKEN by setup-node) took
  precedence, causing `E404 PUT` even when npm Trusted Publisher was correctly configured.

## [0.1.3] - 2026-06-18

### Fixed

- Release pipeline recovery: `publish.yml` now runs `npm publish --provenance` so npm Trusted Publishing (GitHub Actions OIDC) authenticates correctly. Without provenance, auto-release could create tags and GitHub Releases while npm publish failed with `E404`.

### Changed

- Maintainer release docs (`docs/release.md`, README) now point maintainers at the post-release verification checklist for GitHub release state and npm `latest` after every version bump.

## [0.1.2] - 2026-06-06

### Fixed

- Auto-release workflow was added in 0.1.1 but version never changed in that commit, preventing npm publish. This release bumps the version so auto-release triggers and publishes to npm.

## [0.1.1] - 2026-06-03

### Changed

- Removed stale template docs (`examples.md`, `github-template.md`, `repository-settings.md`, `template-checklist.md`, `typescript.md`) that referenced non-existent files and commands.
- Updated README Package contents to reflect remaining docs.

## [0.1.0] - 2025-06-01

### Added

- Initial pi-autotalk MVP: timed AutoTalk brainstorming from the editor input.
- Commands: `/autotalk:on`, `/autotalk:off`, `/autotalk:mode`, `/autotalk:settings`.
- Settings persistence and validation.
- CI and npm Trusted Publishing workflow.