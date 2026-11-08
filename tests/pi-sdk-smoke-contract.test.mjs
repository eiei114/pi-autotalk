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

function parseRejection(error = "Invalid JSON") {
  return { type: "response", command: "parse", success: false, error };
}

const persistedSteer15 = { intervalSec: 15, deliveryMode: "steer" };

/** Feature-level invalid-interval run: AutoTalk warns and nothing is persisted. */
function invalidIntervalEvidence(overrides = {}) {
  return {
    responses: [
      response("error-settings"),
      { type: "extension_ui_request", method: "input", title: "AutoTalk interval seconds (5-120):" },
      { type: "extension_ui_request", method: "notify", notifyType: "warning",
        message: "Interval must be an integer from 5 to 120 seconds." },
    ],
    fullOutput: "",
    exit_code: 0,
    expectedSettingsBeforeError: persistedSteer15,
    persistedSettingsBeforeError: persistedSteer15,
    persistedSettingsAfterError: persistedSteer15,
    parserResponses: [parseRejection()],
    ...overrides,
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
    ["error_path", invalidIntervalEvidence()],
    ["reload_cleanup", { responses: [response("reload-on"), status(15, "steer")], fullOutput: "", exit_code: 0, exit_codes: [0, 0], persistedSettings }],
    ["host_shell", { responses: [], fullOutput: "1.2.0\n", exit_code: 0, expectedVersion: "1.2.0" }],
  ];
  const requiredIds = {
    extension_load: ["extension_registered"],
    happy_path: ["feature_response"],
    error_path: ["handled_error", "host_parse_error_supplemental"],
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

test("error_path ignores a prior host and seeds its own settings", () => {
  // The live harness seeds known-valid settings before the error host, so a failing happy-path
  // host cannot change error_path's before-state. Model that: unseeded (null) fails closed and a
  // seeded run passes with the exact seeded value.
  const unseeded = behaviorAssertions("error_path", invalidIntervalEvidence({
    persistedSettingsBeforeError: null,
    persistedSettingsAfterError: null,
  })).find((item) => item.id === "handled_error");
  assert.equal(unseeded.passed, false);

  const seeded = behaviorAssertions("error_path", invalidIntervalEvidence())
    .find((item) => item.id === "handled_error");
  const observed = JSON.parse(seeded.observed);
  assert.equal(observed.expectedBefore.intervalSec, 15);
  assert.equal(observed.persistedBefore.intervalSec, 15);
  assert.equal(observed.persistedAfter.intervalSec, 15);
  assert.equal(seeded.passed, true);
});

test("error_path requires AutoTalk's own validation warning, not only a host parse error", () => {
  const warn = (evidence) => behaviorAssertions("error_path", evidence)
    .find((item) => item.id === "handled_error");

  // Parser-only fixture (the previous, insufficient shape) must fail feature error handling.
  const parserOnly = warn({
    responses: [parseRejection()], fullOutput: "", exit_code: 0,
    persistedSettingsBeforeError: persistedSteer15, persistedSettingsAfterError: persistedSteer15,
  });
  assert.equal(parserOnly.passed, false);

  // Missing warning must fail.
  assert.equal(warn(invalidIntervalEvidence({
    responses: [response("error-settings")],
  })).passed, false);

  // A warning with the wrong kind is not the observed feature rejection.
  assert.equal(warn(invalidIntervalEvidence({
    responses: [response("error-settings"),
      { type: "extension_ui_request", method: "notify", notifyType: "info",
        message: "Interval must be an integer from 5 to 120 seconds." }],
  })).passed, false);

  // Invalid settings actually persisted must fail even when the warning exists.
  assert.equal(warn(invalidIntervalEvidence({
    persistedSettingsAfterError: { intervalSec: 999, deliveryMode: "steer" },
  })).passed, false);

  // An unhandled host error must fail.
  assert.equal(warn(invalidIntervalEvidence({
    fullOutput: "UnhandledPromiseRejection: boom",
  })).passed, false);

  // A missing seeded before-state must fail: rejection cannot be proven without a starting value.
  assert.equal(warn(invalidIntervalEvidence({
    persistedSettingsBeforeError: null,
  })).passed, false);

  // A before-state that is not the known-valid seed must fail, even when it is unchanged.
  assert.equal(warn(invalidIntervalEvidence({
    persistedSettingsBeforeError: { intervalSec: 10, deliveryMode: "followUp" },
  })).passed, false);

  // The positive fixture keeps both assertions green.
  assert.ok(behaviorAssertions("error_path", invalidIntervalEvidence()).every((item) => item.passed));
});
