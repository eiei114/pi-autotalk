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

test("isDeliveryMode validates only followUp and steer", () => {
  assert.equal(autotalk.isDeliveryMode("followUp"), true);
  assert.equal(autotalk.isDeliveryMode("steer"), true);
  assert.equal(autotalk.isDeliveryMode("other"), false);
  assert.equal(autotalk.isDeliveryMode(undefined), false);
  assert.equal(autotalk.isDeliveryMode(""), false);
});

test("formatEmptyPrompt returns the one-shot continuation message", () => {
  const message = autotalk.formatEmptyPrompt();
  assert.match(message, /^\[AutoTalk\]/);
  assert.match(message, /editor is empty/);
  assert.match(message, /one question/);
});

test("withAutoTalkPrefix shares the AutoTalk tag across prompt formatters", () => {
  assert.equal(autotalk.withAutoTalkPrefix("body"), `${autotalk.AUTOTALK_PREFIX}\nbody`);
  assert.equal(
    autotalk.formatThoughtMemo("memo"),
    autotalk.withAutoTalkPrefix(`This is an automatically sent user thought memo.
Expand the ideas, organize the key points, and ask one follow-up question.
Unless explicitly requested, do not edit files, run commands, or send external messages.

--- Thought memo ---
memo`),
  );
  assert.equal(
    autotalk.formatEmptyPrompt(),
    autotalk.withAutoTalkPrefix(
      "The editor is empty. From the conversation so far, ask one question to think about next.",
    ),
  );
});

test("DELIVERY_MODE_OPTIONS lists supported delivery modes", () => {
  assert.deepEqual(autotalk.DELIVERY_MODE_OPTIONS, ["followUp", "steer"]);
  for (const mode of autotalk.DELIVERY_MODE_OPTIONS) {
    assert.equal(autotalk.isDeliveryMode(mode), true);
  }
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
