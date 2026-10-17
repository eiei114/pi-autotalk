import assert from "node:assert/strict";
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
