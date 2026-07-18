import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);

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
