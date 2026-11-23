import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { default: registerAutoTalk } = await import("../extensions/index.ts");
const { formatEmptyPrompt, formatThoughtMemo } = await import("../lib/autotalk.ts");

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
    assert.equal(sentMessages[0].length, 1);
    assert.equal(typeof sentMessages[0][0], "string");
    assert.equal(editorText, "");
    await commands.get("autotalk:off")("", ctx);
  } finally {
    Date.now = originalNow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

for (const deliveryMode of ["followUp", "steer"]) {
  test(`a due send while busy forwards ${deliveryMode}`, async () => {
    const originalNow = Date.now;
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    const originalHome = process.env.HOME;
    const originalUserProfile = process.env.USERPROFILE;
    const home = await mkdtemp(join(tmpdir(), "pi-autotalk-home-"));
    let now = 1_000;
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
    process.env.HOME = home;
    process.env.USERPROFILE = home;

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
        isIdle: () => false,
        ui: {
          getEditorText: () => "memo",
          setEditorText() {},
          setStatus() {},
          theme: { fg: (_color, text) => text },
          select: async () => deliveryMode,
        },
      };

      await commands.get("autotalk:mode")("", ctx);
      await commands.get("autotalk:on")("", ctx);
      const tickTimer = timers.find((timer) => timer.delay === 10_000);
      assert.ok(tickTimer);

      now += 2_001;
      tickTimer.callback();

      assert.equal(sentMessages.length, 1);
      assert.equal(sentMessages[0].length, 2);
      assert.equal(typeof sentMessages[0][0], "string");
      assert.deepEqual(sentMessages[0][1], { deliverAs: deliveryMode });
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
}

test("a due tick preserves slash commands and still sends ordinary editor text", async () => {
  const originalNow = Date.now;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const home = await mkdtemp(join(tmpdir(), "pi-autotalk-home-"));
  let now = 1_000;
  let editorText = "";
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
  process.env.HOME = home;
  process.env.USERPROFILE = home;

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
        getEditorText: () => editorText,
        setEditorText(text) {
          editorText = text;
        },
        setStatus() {},
        theme: { fg: (_color, text) => text },
      },
    };

    await commands.get("autotalk:on")("", ctx);
    const editorWatcher = timers.find((timer) => timer.delay === 250);
    const tickTimer = timers.find((timer) => timer.delay === 10_000);
    assert.ok(editorWatcher);
    assert.ok(tickTimer);

    const slashCommand = "/autotalk:off  keep this\tbuffer  ";
    editorText = slashCommand;
    editorWatcher.callback();
    now += 2_001;
    tickTimer.callback();

    assert.equal(sentMessages.length, 0);
    assert.equal(editorText, slashCommand);

    const thought = "A regular thought to send";
    editorText = thought;
    editorWatcher.callback();
    now += 2_001;
    tickTimer.callback();

    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0][0].includes(thought), true);
    assert.equal(editorText, "");
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

test("empty-editor follow-ups require a new memo in the current enable cycle", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"] });
  const commands = new Map();
  const sentMessages = [];
  let editorText = "";

  registerAutoTalk({
    on() {},
    registerCommand(name, options) {
      commands.set(name, options.handler);
    },
    sendUserMessage(text) {
      sentMessages.push(text);
    },
  });

  const ctx = {
    hasUI: true,
    isIdle: () => true,
    ui: {
      getEditorText: () => editorText,
      setEditorText(text) {
        editorText = text;
      },
      setStatus() {},
      theme: { fg: (_color, text) => text },
    },
  };

  const enable = () => commands.get("autotalk:on")("", ctx);
  const disable = () => commands.get("autotalk:off")("", ctx);
  const tick = () => t.mock.timers.tick(10_000);
  const sendMemo = (text) => {
    editorText = text;
    t.mock.timers.tick(250); // Let the editor watcher observe the edit before the send tick.
    tick();
    assert.equal(editorText, "");
  };

  await enable();
  tick();
  tick();
  assert.deepEqual(sentMessages, []);

  const followUp = formatEmptyPrompt();
  const first = formatThoughtMemo("First memo");
  const second = formatThoughtMemo("Second memo");
  const third = formatThoughtMemo("Third memo");
  sendMemo("First memo");
  assert.deepEqual(sentMessages, [first]);
  tick();
  assert.deepEqual(sentMessages, [first, followUp]);
  tick();
  tick();
  assert.deepEqual(sentMessages, [first, followUp]);

  sendMemo("Second memo");
  tick();
  assert.deepEqual(sentMessages, [first, followUp, second, followUp]);

  sendMemo("Third memo");
  await disable();
  await enable();
  tick();
  tick();
  assert.deepEqual(sentMessages, [first, followUp, second, followUp, third]);
  await disable();
});

for (const kind of ["memo", "empty follow-up"]) {
  test(`a failed timer send retries the ${kind} on a later tick`, async (t) => {
    t.mock.timers.enable({ apis: ["Date", "setInterval"] });
    const commands = new Map();
    const notifications = [];
    const attempts = [];
    const sentMessages = [];
    const draft = "Private draft";
    const memo = formatThoughtMemo(draft);
    const followUp = formatEmptyPrompt();
    let editorText = draft;
    let failNext = kind === "memo";

    registerAutoTalk({
      on() {},
      registerCommand(name, options) {
        commands.set(name, options.handler);
      },
      sendUserMessage(text) {
        attempts.push(text);
        if (failNext) {
          failNext = false;
          throw new Error(`Failed to deliver ${text}`);
        }
        sentMessages.push(text);
      },
    });

    const ctx = {
      hasUI: true,
      isIdle: () => kind === "memo",
      ui: {
        getEditorText: () => editorText,
        setEditorText(text) {
          editorText = text;
        },
        setStatus() {},
        theme: { fg: (_color, text) => text },
        notify: (...args) => notifications.push(args),
      },
    };

    await commands.get("autotalk:on")("", ctx);
    const tick = () => t.mock.timers.tick(10_000);
    const isMemo = kind === "memo";
    if (!isMemo) {
      tick(); // Successfully send a memo to arm the empty follow-up.
      assert.equal(editorText, "");
      failNext = true;
    }

    tick();
    // Let node:test observe any unhandled rejection from the timer callback.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(editorText, isMemo ? draft : "");
    assert.deepEqual(sentMessages, isMemo ? [] : [memo]);
    assert.deepEqual(notifications, [["AutoTalk could not send the message.", "warning"]]);

    tick();
    assert.equal(editorText, "");
    assert.deepEqual(sentMessages, isMemo ? [memo] : [memo, followUp]);
    assert.deepEqual(attempts, isMemo ? [memo, memo] : [memo, followUp, followUp]);
    if (!isMemo) {
      tick();
      assert.deepEqual(attempts, [memo, followUp, followUp]);
    }
    await commands.get("autotalk:off")("", ctx);
  });
}

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

test("a failed settings save preserves the active timer, delivery mode, and footer", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_000 });
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const home = await mkdtemp(join(tmpdir(), "pi-autotalk-home-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  t.after(async () => {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    await rm(home, { recursive: true, force: true });
  });

  // A directory at the settings file path makes the write fail without permission tricks.
  await mkdir(join(home, ".pi", "agent", "extensions", "autotalk", "settings.json"), {
    recursive: true,
  });

  const commands = new Map();
  const statuses = [];
  const notifications = [];
  const sentMessages = [];
  let editorText = "memo";
  registerAutoTalk({
    on() {},
    registerCommand(name, options) {
      commands.set(name, options.handler);
    },
    sendUserMessage: (...args) => sentMessages.push(args),
  });

  const ctx = {
    hasUI: true,
    isIdle: () => false,
    ui: {
      getEditorText: () => editorText,
      setEditorText(text) {
        editorText = text;
      },
      setStatus: (_key, status) => statuses.push(status),
      theme: { fg: (_color, text) => text },
      input: async () => "15",
      select: async () => "steer",
      notify: (...args) => notifications.push(args),
    },
  };

  await commands.get("autotalk:on")("", ctx);
  t.mock.timers.tick(5_000);
  await commands.get("autotalk:settings")("", ctx);
  assert.deepEqual(notifications, [
    ["Could not save AutoTalk settings. No changes applied.", "warning"],
  ]);
  assert.deepEqual(statuses, ["AutoTalk on 10s followUp"]);

  t.mock.timers.tick(4_999);
  assert.deepEqual(sentMessages, []);
  t.mock.timers.tick(1);
  assert.deepEqual(sentMessages, [[formatThoughtMemo("memo"), { deliverAs: "followUp" }]]);

  // A fresh footer render still reads the original live settings.
  await commands.get("autotalk:off")("", ctx);
  await commands.get("autotalk:on")("", ctx);
  assert.equal(statuses.at(-1), "AutoTalk on 10s followUp");
  await commands.get("autotalk:off")("", ctx);
});
