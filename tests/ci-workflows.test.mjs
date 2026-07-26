import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);
const workflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/publish.yml",
];

test("Node setup workflows pin actions/setup-node@v7", async () => {
  const workflows = await Promise.all(
    workflowPaths.map((relativePath) =>
      readFile(new URL(relativePath, repoRoot), "utf8"),
    ),
  );

  for (const [index, workflow] of workflows.entries()) {
    assert.match(
      workflow,
      /actions\/setup-node@v7\b/,
      `${workflowPaths[index]} should use actions/setup-node@v7`,
    );
    assert.doesNotMatch(
      workflow,
      /actions\/setup-node@v6\b/,
      `${workflowPaths[index]} should not keep actions/setup-node@v6`,
    );
  }
});
