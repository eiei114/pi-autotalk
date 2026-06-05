# Release

This package uses npm Trusted Publishing with GitHub Actions OIDC.

Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## One-time npm setup

On npmjs.com, configure Trusted Publishing for this package:

- Publisher: GitHub Actions
- Repository: this GitHub repository
- Workflow filename: `publish.yml`

## Publish

### Automated (recommended)

1. Bump `version` in `package.json` (for example `npm version patch` without pushing tags locally).
2. Merge or push to `main`.
3. `.github/workflows/auto-release.yml` detects the version change, creates tag `v<version>` and a GitHub release, then runs `gh workflow run publish.yml --ref v<version>`.
4. `.github/workflows/publish.yml` checks out that ref, runs CI, and publishes via OIDC.

### Manual tag (fallback)

```bash
npm version patch
git push --follow-tags
```

A `v*` tag push still triggers `publish.yml` directly if you need a one-off manual release.

## Verify tag → publish handoff

After the first automated release (or in a fork with Actions enabled):

1. Confirm **Auto Release** completed on the `main` commit that changed `package.json`.
2. Confirm tag `v<version>` exists and **Publish Package** ran for that ref (workflow dispatch from auto-release, or tag push).
3. Confirm the package version appears on npm.

Dry-run locally before merging a version bump:

```bash
npm run ci
npm pack --dry-run
```

## GitHub Actions requirements

- `permissions: id-token: write`
- GitHub-hosted runner
- No `NPM_TOKEN`
- `npm publish` from the configured workflow file

## First release checklist

- [ ] `package.json` name is final
- [ ] `repository.url` points to the real GitHub repository
- [ ] npm Trusted Publisher is configured
- [ ] `npm run ci` passes
- [ ] `npm pack --dry-run` contains only intended files
- [ ] `CHANGELOG.md` has the release date