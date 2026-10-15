import assert from "node:assert/strict";
import test from "node:test";
import { behaviorAssertions, parseJsonLines } from "../scripts/pi-sdk-smoke-contract.mjs";

function response(id, disposition = "handled") {
  return { id, type: "response", command: "prompt", success: true, data: { disposition } };
}

function status(intervalSec, deliveryMode) {
  return {
    type: "extension_ui_request", method: "setStatus", statusKey: "autotalk",
    statusText: `AutoTalk on ${intervalSec}s ${deliveryMode}`,
  };
}

test("smoke JSONL parser ignores non-JSON diagnostics without truncating valid records", () => {
  assert.deepEqual(parseJsonLines('diagnostic\n{"type":"response","success":true}\n'), [
    { type: "response", success: true },
  ]);
});

test("all required Pi behavior assertions pass with observed AutoTalk responses", () => {
  const persistedSettings = { intervalSec: 15, deliveryMode: "steer" };
  const fixtures = [
    ["extension_load", { responses: [response("load-on"), status(10, "followUp")], fullOutput: "", exit_code: 0 }],
    ["happy_path", { responses: [response("feature-on"), status(15, "steer")], fullOutput: "", exit_code: 0, persistedSettings }],
    ["error_path", { responses: [{ type: "response", command: "parse", success: false, error: "Invalid JSON" }], fullOutput: "", exit_code: 0 }],
    ["reload_cleanup", { responses: [response("reload-on"), status(15, "steer")], fullOutput: "", exit_code: 0, exit_codes: [0, 0], persistedSettings }],
    ["host_shell", { responses: [], fullOutput: "1.2.0\n", exit_code: 0, expectedVersion: "1.2.0" }],
  ];
  const requiredIds = {
    extension_load: ["extension_registered"],
    happy_path: ["feature_response"],
    error_path: ["handled_error"],
    reload_cleanup: ["reloaded_extension_registered", "reloaded_feature_response", "clean_shutdown"],
    host_shell: ["native_shell_boundary"],
  };
  for (const [name, evidence] of fixtures) {
    const assertions = behaviorAssertions(name, evidence);
    assert.deepEqual(assertions.map((item) => item.id), requiredIds[name]);
    assert.ok(assertions.every((item) => item.passed), `${name}: ${JSON.stringify(assertions)}`);
  }
});

test("missing feature and reload responses fail closed", () => {
  const missingFeature = behaviorAssertions("happy_path", {
    responses: [], fullOutput: "", exit_code: 0,
    persistedSettings: { intervalSec: 15, deliveryMode: "steer" },
  });
  assert.equal(missingFeature[0].id, "feature_response");
  assert.equal(missingFeature[0].passed, false);

  const missingReload = behaviorAssertions("reload_cleanup", {
    responses: [response("reload-on")], fullOutput: "", exit_code: 0,
    exit_codes: [0, 0], persistedSettings: { intervalSec: 15, deliveryMode: "steer" },
  });
  assert.deepEqual(missingReload.map((item) => item.passed), [false, false, true]);
});

test("reload and shutdown assertions reject nonzero or unobserved process exit", () => {
  const assertions = behaviorAssertions("reload_cleanup", {
    responses: [response("reload-on"), status(15, "steer")], fullOutput: "",
    exit_code: 0, exit_codes: [0, null],
    persistedSettings: { intervalSec: 15, deliveryMode: "steer" },
  });
  assert.equal(assertions.find((item) => item.id === "clean_shutdown").passed, false);
});
