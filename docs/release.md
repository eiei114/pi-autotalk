# Release

This package publishes to npm with **npm Trusted Publishing (GitHub Actions OIDC)**.

Do **not** add `NPM_TOKEN` or any long-lived npm token to GitHub Secrets. The
publish step authenticates via an OIDC token minted by GitHub Actions and linked
to this package on npmjs.com.

> **Known drift (as of 2026-06-14):** GitHub is at `v0.1.2` but npm `latest` is
> still `0.1.0`. Versions `0.1.1` and `0.1.2` were never published to npm. The
> investigation, root cause, verification checklist, and recovery path are in the
> last three sections of this document. Read them before doing another release.

## Model

Two workflows cooperate:

- `.github/workflows/auto-release.yml` — on push to `main` that increases
  `package.json#version`, creates tag `v<version>`, creates the GitHub Release,
  then dispatches `publish.yml` at that ref.
- `.github/workflows/publish.yml` — checks out the ref, runs CI, then publishes
  to npm. It triggers on `push: tags v*` (manual `npm version` + push) **and** on
  `workflow_dispatch` from `auto-release.yml`.

The critical handoff is the last hop: auto-release can succeed (tag + release
created, publish dispatched) while the dispatched `publish.yml` still fails at
`npm publish`. A green auto-release run is **not** proof that npm received the
package — always run the [verification checklist](#post-release-verification-checklist).

## One-time npm setup

On npmjs.com, configure Trusted Publishing for this package (`eiei114/pi-autotalk`):

- Publisher: GitHub Actions
- Repository: `eiei114/pi-autotalk`
- Workflow filename: `publish.yml`
- (Optional) Environment: leave unset unless you pin one in the workflow

This must be done **before** the first automated publish. If 0.1.0 was published
manually with a local login, the Trusted Publisher link may never have been
created — verify it during [recovery](#recovery-github-release-exists-but-npm-latest-is-stale).

## Publish

### Automated (recommended)

1. Bump `version` in `package.json` and update `CHANGELOG.md` in the same change
   (e.g. via a PR; the CI `version:check` guard requires a matching CHANGELOG
   entry when the version increases).
2. Merge to `main`.
3. `auto-release.yml` detects the version increase, creates tag `v<version>` and
   a GitHub Release, then runs `gh workflow run publish.yml --ref v<version>`.
4. `publish.yml` checks out that ref, runs CI, and publishes via OIDC.
5. Run the [verification checklist](#post-release-verification-checklist).

### Manual tag (fallback)

```bash
npm version patch        # or minor / major
git push origin main --follow-tags
```

A `v*` tag push triggers `publish.yml` directly. Use this for a one-off release
when you do not want to rely on auto-release. Still run the verification
checklist afterwards.

## Post-release verification checklist

Run **after every version bump**, whether automated or manual. A release is only
"done" when npm `latest` equals the new version.

Replace `<v>` with the version (e.g. `0.1.2`) and `<V>` with the tag (e.g. `v0.1.2`).

- [ ] **Auto Release ran and succeeded** on the `main` commit that bumped the
      version.
      `gh run list --workflow=auto-release.yml --limit 5`
- [ ] **Tag `<V>` exists** on the remote and points at the bump commit.
      `git ls-remote --tags origin 'v*'`  →  must list `<V>`
- [ ] **GitHub Release `<V>` exists** and is published (not draft, not prerelease).
      `gh release view <V>`
- [ ] **Publish Package ran for `<V>`** and its conclusion is `success`. This is
      the run auto-release dispatched (event `workflow_dispatch`, branch `<V>`).
      `gh run list --workflow=publish.yml --limit 10`
- [ ] If Publish Package **failed**, open the run and read the `Run npm publish`
      step log. The most common failure is `npm error code E404 ... PUT
      https://registry.npmjs.org/pi-autotalk - Not found` (see
      [Recovery](#recovery-github-release-exists-but-npm-latest-is-stale)).
      `gh run view <run-id> --log`
- [ ] **npm `latest` equals `<v>`.**
      `npm view pi-autotalk version`
- [ ] **npm shows `<v>` in `time`.**
      `npm view pi-autotalk time --json`

One-liner snapshot for a quick diff after release:

```bash
node -p "require('./package.json').version"   # repo
git ls-remote --tags origin 'v*'              # tags
gh release list --limit 5                     # releases
gh run list --workflow=publish.yml --limit 5  # publish runs
npm view pi-autotalk version                  # npm latest
```

A release is healthy **iff** the repo version, the newest `v*` tag, the newest
GitHub Release, the newest successful Publish run, and npm `latest` all agree.

## Recovery: GitHub release exists but npm latest is stale

Use this when a tag + GitHub Release exist for `<V>` but `npm view
pi-autotalk version` returns an older version. This is exactly the 2026-06 drift.

### 1. Confirm and scope the drift

```bash
npm view pi-autotalk version          # current npm latest
npm view pi-autotalk time --json      # every published version + dates
git ls-remote --tags origin 'v*'      # every GitHub tag
gh release list                       # every GitHub Release
```

Any tag `<V>` with no matching entry in npm `time` is a missing publish. List
them; you will republish each missing version.

### 2. Find why the publish failed

Find the Publish Package run that auto-release dispatched for `<V>` (event
`workflow_dispatch`, branch `<V>`):

```bash
gh run list --workflow=publish.yml --branch <V> --limit 5
gh run view <run-id> --log           # read the "Run npm publish" step
```

For the 2026-06 drift the failing run was `27050120988` and the error was:

```
npm error code E404
npm error 404 Not Found - PUT https://registry.npmjs.org/pi-autotalk - Not found
npm error 404  'pi-autotalk@0.1.2' is not in this registry.
```

The most likely root cause (this repo's model is Trusted Publishing, no token):

- `publish.yml` runs `npm publish` **without `--provenance`** and exposes **no
  `NODE_AUTH_TOKEN`**. npm Trusted Publishing via GitHub Actions OIDC is only
  exercised when the publish runs with `--provenance`; without it the npm CLI
  never mints the OIDC token, the PUT is effectively unauthenticated, and npm
  returns `E404` (it hides package existence from unauthenticated callers).
- Rule out the secondary cause: the **Trusted Publisher is not registered on
  npmjs.com**, or is scoped to the wrong workflow file / trigger. On npmjs.com
  open the package → Settings → Trusted Publishers and confirm: repository
  `eiei114/pi-autotalk`, workflow filename `publish.yml`. Because 0.1.0 was
  published with a manual login, this link may never have been created.

### 3. Fix the publish path before republishing

Pick the fix that matches this repo's model (Trusted Publishing):

- Ensure `publish.yml` publishes with provenance, e.g. `npm publish --provenance`,
  and that the job still has `permissions: id-token: write`.
- Confirm the Trusted Publisher registration on npmjs.com (step 2).

(If you ever move away from Trusted Publishing, the alternative is to set an npm
automation token in `NPM_TOKEN` and expose `NODE_AUTH_TOKEN: ${{
secrets.NPM_TOKEN }}` on the publish step. This repo deliberately does **not** do
that.)

Do the fix on `main` first and verify with a real release before republishing
historical versions — otherwise every republish will fail the same way.

### 4. Republish the missing version(s)

Each missing version must be published from its **own** tagged commit (npm
rejects re-publishing a version, and you cannot publish `0.1.2` from the `0.1.1`
tree). For each `<V>` that exists as a tag but not on npm:

```bash
# Re-dispatch publish.yml at the existing tag (mirrors what auto-release does).
gh workflow run publish.yml --ref <V> -f ref=<V>

# Watch the run.
gh run list --workflow=publish.yml --branch <V> --limit 3
gh run watch <run-id>
```

`--ref <V>` checks out the tagged commit, so the published `package.json`
version matches the tag. Do **not** create new tags or bump the version for a
recovery publish — you are publishing a version that already exists on GitHub.

For the 2026-06 drift, repeat for `v0.1.1` and `v0.1.2` if both should appear on
npm; if only the newest matters, publish `v0.1.2` and accept the `0.1.1` gap
(document it here under [Known release drift](#known-release-drift--2026-06-investigation)).

### 5. Confirm npm and fix the `latest` dist-tag

```bash
npm view pi-autotalk version          # should now be <v>
npm view pi-autotalk dist-tags        # latest should point at <v>
```

`npm publish` moves `latest` to the highest published version automatically. If
it is wrong (e.g. you published an older missing version after a newer one),
repoint it explicitly:

```bash
npm dist-tag add pi-autotalk@<v> latest
```

### 6. Notes and caveats

- npm only allows `unpublish` within 72 hours of publish, and only when nothing
  depends on the version. Prefer `npm deprecate pi-autotalk@<v> "reason"` over
  unpublish for old versions.
- You cannot republish a version that is already on npm. If a partial publish
  created the version but `latest` is wrong, fix the dist-tag, do not republish.
- A failed `Publish Package` run leaves **no** artifact on npm — retrying the
  same version is safe and expected.

## Known release drift — 2026-06 investigation

Snapshot taken 2026-06-14. Concrete versions, dates, and SHAs so future audits
are not relative-time ambiguous.

| Artifact | Value | Observed |
|---|---|---|
| `package.json` version (main HEAD) | `0.1.2` | commit `bdd0807`, merged 2026-06-06 |
| Git tags (local + remote) | `v0.1.2` only | points at `bdd0807`; created 2026-06-06T02:30:07Z |
| GitHub Releases | `v0.1.2` only | published 2026-06-06T02:30:16Z |
| npm `latest` dist-tag | `0.1.0` | — |
| npm published versions | `0.1.0` only | `0.1.0` published 2026-05-31T02:52:46Z; registry not modified since |
| npm package maintainer | `eiei114` | — |

**Drift:** GitHub and `package.json` are at `v0.1.2`; npm `latest` is `0.1.0`.
`0.1.1` and `0.1.2` exist on GitHub but were never published to npm.

### How each version reached its current state

- **`0.1.0`** — published to npm 2026-05-31T02:52:46Z. The auto-release and
  publish workflows did not exist yet (auto-release was added in commit
  `03073d8`, 2026-06-06). 0.1.0 was therefore a **manual** publish by the
  maintainer, not a workflow publish. No `v0.1.0` tag and no GitHub Release were
  created.
- **`0.1.1`** — `version` set to `0.1.1` in `package.json` at commit `34e2a2a`
  (2026-06-03). Auto-release did not exist yet, so the bump was never observed:
  no tag, no release, no publish. npm never received 0.1.1.
- **`0.1.2`** — bump at commit `3f32c88`, merged to `main` as `bdd0807`
  (2026-06-06T02:30Z). Auto-release ran and **succeeded**: it created tag
  `v0.1.2`, GitHub Release `v0.1.2`, and dispatched `publish.yml` at `v0.1.2`
  (run `27050120988`, event `workflow_dispatch`). That Publish Package run
  **failed** at the `Run npm publish` step with `npm error code E404 / 404 Not
  Found - PUT https://registry.npmjs.org/pi-autotalk`. Every preceding step
  (checkout, setup-node, `npm ci`, typecheck, test, `pack:check`) passed and the
  tarball was built correctly (`pi-autotalk@0.1.2`, 7 files, 7.6 kB).

### Most likely failure point

The break is the **last hop**: `npm publish` inside `publish.yml`.

- `publish.yml` runs `npm publish` with no `--provenance` and exposes no
  `NODE_AUTH_TOKEN`. With the Trusted Publishing model there is no token secret
  by design.
- npm Trusted Publishing via GitHub Actions OIDC is only exercised when the
  publish runs **with `--provenance`**. Without it the npm CLI never mints the
  OIDC token, the PUT is effectively anonymous, and npm returns `E404`.
- Secondary cause to rule out during recovery: the Trusted Publisher is not
  registered on npmjs.com, or is scoped to the wrong workflow file / trigger
  (e.g. registered for `push: tags` only, not `workflow_dispatch`). Because
  `0.1.0` was published manually, the link may never have been created.

The fix, verification, and republish steps are in
[Recovery](#recovery-github-release-exists-but-npm-latest-is-stale). No version
bump, CHANGELOG entry, tag, or npm publish was performed as part of this
investigation slice — it is documentation only; the actual republish is a
separate, explicitly approved action.

## GitHub Actions requirements

- `permissions: id-token: write` on the publish job
- GitHub-hosted runner
- No `NPM_TOKEN`
- `npm publish` (with `--provenance` for Trusted Publishing) from the configured
  workflow file (`publish.yml`)

## Local pre-release dry run

```bash
npm run ci            # typecheck + tests + pack:check
npm pack --dry-run    # confirm only intended files are included
```

## First release checklist

- [ ] `package.json` name is final (`pi-autotalk`)
- [ ] `repository.url` points to the real GitHub repository
- [ ] npm Trusted Publisher is configured on npmjs.com (repo + `publish.yml`)
- [ ] `npm run ci` passes
- [ ] `npm pack --dry-run` contains only intended files
- [ ] `CHANGELOG.md` has the release date
- [ ] First automated publish passes the
      [verification checklist](#post-release-verification-checklist)
