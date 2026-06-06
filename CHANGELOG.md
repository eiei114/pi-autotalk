# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

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