import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertNotOlderThanLatestStable, highestStableRelease } from "../scripts/check-release-version.mjs";

const releaseWorkflow = await readFile(new URL("../.github/workflows/auto-release.yml", import.meta.url), "utf8");
const publishWorkflow = await readFile(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

function assertNoMergeTriggeredRelease(release, publish) {
  const releaseTriggers = release.split("permissions:")[0];
  const publishTriggers = publish.split("permissions:")[0];
  assert.match(releaseTriggers, /on:\r?\n\s+workflow_dispatch:/, "release must be manually triggered only");
  assert.doesNotMatch(releaseTriggers, /^\s+push:/m, "a merge must not start release");
  assert.match(release, /if: github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(publishTriggers, /push:\r?\n\s+tags:/, "publishing must remain version-tag gated");
  assert.doesNotMatch(publishTriggers, /branches:|paths:/, "main branch/package edits must not publish");
  assert.match(publishTriggers, /workflow_dispatch:/, "explicit manual publishing remains available");
  assert.match(publish, /npm publish/);
}

test("merging code cannot directly or indirectly trigger npm publish or release", () => {
  assert.doesNotThrow(() => assertNoMergeTriggeredRelease(releaseWorkflow, publishWorkflow));
  assert.throws(() => assertNoMergeTriggeredRelease(
    releaseWorkflow.replace("  workflow_dispatch:", "  push:\n    branches: [main]\n  workflow_dispatch:"), publishWorkflow));
  assert.throws(() => assertNoMergeTriggeredRelease(
    releaseWorkflow, publishWorkflow.replace("    tags:", "    branches: [main]\n    tags:")));
});

test("manual release rejects malformed SemVer without leading zeros", () => {
  const pattern = releaseWorkflow.match(/grep -Eq '([^']+)'/)?.[1];
  assert.ok(pattern, "manual release must validate stable SemVer");
  const stableSemver = new RegExp(pattern);
  for (const version of ["0.0.0", "1.4.2", "10.20.300"]) assert.match(version, stableSemver);
  for (const version of ["01.4.2", "1.04.2", "1.4.02", "1.4", "1.4.2-beta"]) assert.doesNotMatch(version, stableSemver);
});

test("manual release rejects an untagged version older than the highest stable release", () => {
  const tags = ["v0.1.9", "v0.2.0-beta.1", "v0.1.10", "v0.2.0"];

  assert.equal(highestStableRelease(tags)?.version, "0.2.0");
  assert.throws(
    () => assertNotOlderThanLatestStable("0.1.10", tags),
    /older than the latest stable release 0\.2\.0/,
  );
  assert.doesNotThrow(() => assertNotOlderThanLatestStable("0.2.0", tags));
  assert.doesNotThrow(() => assertNotOlderThanLatestStable("0.2.1", tags));
});

test("manual release uses numeric SemVer ordering and ignores non-stable tags", () => {
  const tags = ["v1.9.0", "v1.10.0-rc.1", "v1.10.0", "v2.0.0-beta.1", "release-notes"];

  assert.equal(highestStableRelease(tags)?.version, "1.10.0");
  assert.throws(() => assertNotOlderThanLatestStable("1.9.99", tags), /older than/);
  assert.throws(() => assertNotOlderThanLatestStable("01.10.0", tags), /not a stable semver/);
});

test("release version ordering is checked before the workflow marks a version releasable", () => {
  const comparison = releaseWorkflow.indexOf("node scripts/check-release-version.mjs \"$CURRENT_VERSION\"");
  const releaseFlag = releaseWorkflow.indexOf('echo "released=true"');

  assert.notEqual(comparison, -1, "workflow must compare against stable release tags");
  assert.ok(comparison < releaseFlag, "version ordering must pass before released=true");
});
