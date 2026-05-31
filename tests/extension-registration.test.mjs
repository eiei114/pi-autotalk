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
