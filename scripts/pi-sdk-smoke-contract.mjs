export const SDK_NAMES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];
export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function promptResponse(responses, id) {
  return responses.find((row) => row?.type === "response" && row.command === "prompt" && row.id === id);
}

function onStatus(responses, intervalSec, deliveryMode) {
  return responses.find((row) => row?.type === "extension_ui_request"
    && row.method === "setStatus" && row.statusKey === "autotalk"
    && typeof row.statusText === "string"
    && row.statusText.includes(`on ${intervalSec}s ${deliveryMode}`));
}

export function behaviorAssertions(name, evidence) {
  const { responses, fullOutput, exit_code } = evidence;
  if (name === "extension_load") {
    const response = promptResponse(responses, "load-on");
    const status = onStatus(responses, 10, "followUp");
    return [assertion("extension_registered",
      "Actual Pi handles /autotalk:on and emits AutoTalk's enabled status",
      { response: response ?? null, status: status ?? null },
      response?.success === true && response.data?.disposition === "handled" && !!status)];
  }
  if (name === "happy_path") {
    const response = promptResponse(responses, "feature-on");
    const status = onStatus(responses, 15, "steer");
    return [assertion("feature_response",
      "Settings entered through Pi RPC persist and the enabled command reports the configured interval and mode",
      { response: response ?? null, status: status ?? null, persistedSettings: evidence.persistedSettings ?? null },
      response?.success === true && response.data?.disposition === "handled" && !!status
        && evidence.persistedSettings?.intervalSec === 15 && evidence.persistedSettings?.deliveryMode === "steer")];
  }
  if (name === "error_path") {
    const parse = responses.find((row) => row?.type === "response" && row.command === "parse");
    return [assertion("handled_error",
      "Malformed RPC input is rejected with success=false and a parse error, without an unhandled host error",
      parse ?? null,
      parse?.success === false && typeof parse.error === "string" && parse.error.length > 0
        && !UNHANDLED_ERROR_PATTERN.test(fullOutput))];
  }
  if (name === "reload_cleanup") {
    const response = promptResponse(responses, "reload-on");
    const status = onStatus(responses, 15, "steer");
    return [
      assertion("reloaded_extension_registered",
        "A second actual Pi host loads the persisted AutoTalk settings and handles /autotalk:on",
        response ?? null,
        response?.success === true && response.data?.disposition === "handled" && !!status),
      assertion("reloaded_feature_response",
        "The reloaded host emits the feature status using settings persisted by the first host",
        { status: status ?? null, persistedSettings: evidence.persistedSettings ?? null },
        !!status && evidence.persistedSettings?.intervalSec === 15 && evidence.persistedSettings?.deliveryMode === "steer"),
      assertion("clean_shutdown",
        "Both actual Pi hosts close with exit code zero and no unhandled or shutdown errors",
        { exit_codes: evidence.exit_codes ?? [], errors: UNHANDLED_ERROR_PATTERN.test(fullOutput) },
        Array.isArray(evidence.exit_codes) && evidence.exit_codes.length === 2
          && evidence.exit_codes.every((code) => code === 0) && !UNHANDLED_ERROR_PATTERN.test(fullOutput)),
    ];
  }
  if (name === "host_shell") {
    return [assertion("native_shell_boundary",
      "Native host shell launches the locally pinned Pi CLI and returns its exact SDK version",
      { exit_code, output: fullOutput.trim(), expectedVersion: evidence.expectedVersion },
      exit_code === 0 && fullOutput.trim() === evidence.expectedVersion)];
  }
  throw new Error(`Unknown smoke case: ${name}`);
}
