import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);
const workflowPaths = [
  ".github/workflows/auto-release.yml",
  ".github/workflows/ci.yml",
  ".github/workflows/publish.yml",
];
const nodeSetupWorkflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/publish.yml",
];

test("GitHub workflows pin actions/checkout@v7", async () => {
  const workflows = await Promise.all(
    workflowPaths.map((relativePath) =>
      readFile(new URL(relativePath, repoRoot), "utf8"),
    ),
  );

  for (const [index, workflow] of workflows.entries()) {
    assert.match(
      workflow,
      /actions\/checkout@v7\b/,
      `${workflowPaths[index]} should use actions/checkout@v7`,
    );
    assert.doesNotMatch(
      workflow,
      /actions\/checkout@v6\b/,
      `${workflowPaths[index]} should not keep actions/checkout@v6`,
    );
  }
});

test("Node setup workflows pin actions/setup-node@v7", async () => {
  const workflows = await Promise.all(
    nodeSetupWorkflowPaths.map((relativePath) =>
      readFile(new URL(relativePath, repoRoot), "utf8"),
    ),
  );

  for (const [index, workflow] of workflows.entries()) {
    assert.match(
      workflow,
      /actions\/setup-node@v7\b/,
      `${nodeSetupWorkflowPaths[index]} should use actions/setup-node@v7`,
    );
    assert.doesNotMatch(
      workflow,
      /actions\/setup-node@v6\b/,
      `${nodeSetupWorkflowPaths[index]} should not keep actions/setup-node@v6`,
    );
  }
});
