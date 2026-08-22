import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);

test("CHANGELOG does not leave a released version bump under Unreleased", async () => {
  const changelog = await readFile(new URL("CHANGELOG.md", repoRoot), "utf8");
  const historicalStart = changelog.indexOf("\n## [");
  const unreleased = historicalStart === -1 ? changelog : changelog.slice(0, historicalStart);

  assert.doesNotMatch(
    unreleased,
    /Bump package version to `\d+\.\d+\.\d+`/,
    "released version bumps belong in a dated CHANGELOG section",
  );
});

test("README documents CI version:check PR guard when workflow runs it", async () => {
  const [readme, ci] = await Promise.all([
    readFile(new URL("README.md", repoRoot), "utf8"),
    readFile(new URL(".github/workflows/ci.yml", repoRoot), "utf8"),
  ]);

  if (!ci.includes("npm run version:check")) {
    return;
  }

  assert.match(readme, /npm run version:check/);
  assert.match(readme, /BASE_REF=origin\/main/);
});
