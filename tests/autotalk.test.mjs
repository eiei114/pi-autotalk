import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const autotalk = await import("../lib/autotalk.ts");

test("normalizeInterval accepts only integer seconds in range", () => {
  assert.equal(autotalk.normalizeInterval("5"), 5);
  assert.equal(autotalk.normalizeInterval(120), 120);
  assert.equal(autotalk.normalizeInterval("4"), undefined);
  assert.equal(autotalk.normalizeInterval(121), undefined);
  assert.equal(autotalk.normalizeInterval(10.5), undefined);
  assert.equal(autotalk.normalizeInterval("abc"), undefined);
});

test("normalizeSettings falls back for invalid values", () => {
  assert.deepEqual(autotalk.normalizeSettings({ intervalSec: 30, deliveryMode: "steer" }), {
    intervalSec: 30,
    deliveryMode: "steer",
  });
  assert.deepEqual(autotalk.normalizeSettings({ intervalSec: 2, deliveryMode: "bad" }), {
    intervalSec: autotalk.DEFAULT_INTERVAL_SEC,
    deliveryMode: "followUp",
  });
});

test("formatThoughtMemo wraps text with AutoTalk safety prefix", () => {
  const message = autotalk.formatThoughtMemo("still thinking");
  assert.match(message, /^\[AutoTalk\]/);
  assert.match(message, /Thought memo/);
  assert.match(message, /Unless explicitly requested/);
  assert.match(message, /still thinking$/);
});

test("saveSettings writes readable global settings JSON", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-autotalk-"));
  const settingsPath = join(dir, "settings.json");

  try {
    await autotalk.saveSettings({ intervalSec: 15, deliveryMode: "steer" }, settingsPath);
    const saved = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.deepEqual(saved, { intervalSec: 15, deliveryMode: "steer" });
    assert.deepEqual(await autotalk.loadSettings(settingsPath), {
      intervalSec: 15,
      deliveryMode: "steer",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
