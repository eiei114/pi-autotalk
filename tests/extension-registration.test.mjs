import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { default: registerAutoTalk } = await import("../extensions/index.ts");

test("extension registers AutoTalk commands", () => {
  const commands = [];
  const events = [];
  const fakePi = {
    on(event, handler) {
      events.push([event, handler]);
    },
    registerCommand(name, options) {
      commands.push([name, options]);
    },
    sendUserMessage() {},
  };

  registerAutoTalk(fakePi);

  assert.deepEqual(
    commands.map(([name]) => name).sort(),
    ["autotalk:mode", "autotalk:off", "autotalk:on", "autotalk:settings"],
  );
  assert.deepEqual(
    events.map(([event]) => event).sort(),
    ["session_shutdown", "session_start"],
  );
});

test("a due send reuses the editor snapshot from the change check", async () => {
  const originalNow = Date.now;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let now = 1_000;
  let editorText = "memo";
  let editorReads = 0;
  const timers = [];
  const commands = new Map();
  const sentMessages = [];

  Date.now = () => now;
  globalThis.setInterval = (callback, delay) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  };
  globalThis.clearInterval = () => {};

  try {
    registerAutoTalk({
      on() {},
      registerCommand(name, options) {
        commands.set(name, options.handler);
      },
      sendUserMessage(...args) {
        sentMessages.push(args);
      },
    });

    const ctx = {
      hasUI: true,
      isIdle: () => true,
      ui: {
        getEditorText() {
          editorReads++;
          return editorText;
        },
        setEditorText(text) {
          editorText = text;
        },
        setStatus() {},
        theme: { fg: (_color, text) => text },
      },
    };

    await commands.get("autotalk:on")("", ctx);
    const tickTimer = timers.find((timer) => timer.delay === 10_000);
    assert.ok(tickTimer);

    editorReads = 0;
    now += 2_001;
    tickTimer.callback();

    assert.equal(editorReads, 2);
    assert.equal(sentMessages.length, 1);
    assert.equal(editorText, "");
    await commands.get("autotalk:off")("", ctx);
  } finally {
    Date.now = originalNow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("settings commands persist and reflect updates without changing timer behavior", async () => {
  const originalNow = Date.now;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const home = await mkdtemp(join(tmpdir(), "pi-autotalk-home-"));
  const now = 1_000;
  const timers = [];
  const clearedTimers = [];
  const commands = new Map();
  const statuses = [];
  const choices = ["steer", "followUp"];

  Date.now = () => now;
  globalThis.setInterval = (callback, delay) => {
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  };
  globalThis.clearInterval = (timer) => clearedTimers.push(timer);
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  try {
    registerAutoTalk({
      on() {},
      registerCommand(name, options) {
        commands.set(name, options.handler);
      },
      sendUserMessage() {},
    });

    const ctx = {
      hasUI: true,
      isIdle: () => true,
      ui: {
        getEditorText: () => "",
        setEditorText() {},
        setStatus: (_key, status) => statuses.push(status),
        theme: { fg: (_color, text) => text },
        input: async () => "15",
        select: async () => choices.shift(),
      },
    };

    await commands.get("autotalk:on")("", ctx);
    const originalTimerCount = timers.length;

    await commands.get("autotalk:mode")("", ctx);
    assert.equal(timers.length, originalTimerCount);
    assert.equal(statuses.at(-1), "AutoTalk on 10s steer");

    await commands.get("autotalk:settings")("", ctx);
    assert.deepEqual(timers.slice(-2).map(({ delay }) => delay), [250, 15_000]);
    assert.deepEqual(clearedTimers, timers.slice(0, originalTimerCount).reverse());
    assert.equal(statuses.at(-1), "AutoTalk on 15s followUp");

    const settings = JSON.parse(
      await readFile(
        join(home, ".pi", "agent", "extensions", "autotalk", "settings.json"),
        "utf8",
      ),
    );
    assert.deepEqual(settings, { intervalSec: 15, deliveryMode: "followUp" });
    await commands.get("autotalk:off")("", ctx);
  } finally {
    Date.now = originalNow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    await rm(home, { recursive: true, force: true });
  }
});
