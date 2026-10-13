import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseStableVersion(version) {
  const match = stableVersionPattern.exec(version);
  if (!match) return null;
  return match.slice(1).map((part) => BigInt(part));
}

export function compareStableVersions(left, right) {
  const leftParts = parseStableVersion(left);
  const rightParts = parseStableVersion(right);
  if (!leftParts || !rightParts) {
    throw new TypeError("Versions must be stable SemVer (MAJOR.MINOR.PATCH).");
  }

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return 0;
}

export function highestStableRelease(tags) {
  return tags.reduce((highest, tag) => {
    if (!tag.startsWith("v")) return highest;
    const version = tag.slice(1);
    if (!parseStableVersion(version)) return highest;
    if (!highest || compareStableVersions(version, highest.version) > 0) {
      return { tag, version };
    }
    return highest;
  }, null);
}

export function assertNotOlderThanLatestStable(currentVersion, tags) {
  if (!parseStableVersion(currentVersion)) {
    throw new TypeError("Repository version is not a stable semver; refusing release.");
  }

  const latest = highestStableRelease(tags);
  if (latest && compareStableVersions(currentVersion, latest.version) < 0) {
    throw new Error(
      `Repository version ${currentVersion} is older than the latest stable release ${latest.version}; refusing release.`,
    );
  }
  return latest;
}

function checkReleaseVersion() {
  const currentVersion = process.argv[2];
  if (!currentVersion) {
    throw new TypeError("Usage: node scripts/check-release-version.mjs <version>");
  }

  const tags = execFileSync("git", ["tag", "--list"], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  const latest = assertNotOlderThanLatestStable(currentVersion, tags);
  if (latest) {
    console.log(`Release version ${currentVersion} is not older than ${latest.tag}.`);
  } else {
    console.log(`No previous stable release tag; allowing ${currentVersion}.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkReleaseVersion();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
