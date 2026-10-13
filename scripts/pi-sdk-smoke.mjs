import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  behaviorAssertions,
  EXTENSION_LOAD_ERROR_PATTERN,
  parseJsonLines,
  SDK_NAMES,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const root = resolve(import.meta.dirname, "..");
const reportPath = process.argv.includes("--update-curated-report")
  ? resolve(root, "docs/verification/pi-sdk-smoke.json")
  : resolve(root, ".tmp/pi-sdk-smoke.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const sdkVersions = Object.fromEntries(SDK_NAMES.map((name) => [
  name,
  readJson(resolve(root, "node_modules", name, "package.json")).version,
]));
for (const name of SDK_NAMES) {
  if (manifest.devDependencies?.[name] !== sdkVersions[name]) {
    throw new Error(`Smoke requires an exact dev/test SDK pin for ${name}; installed ${sdkVersions[name]}`);
  }
}

const piManifest = readJson(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", piManifest.bin.pi);
const agentDir = mkdtempSync(join(tmpdir(), "pi-autotalk-smoke-"));
const isolatedHome = join(agentDir, "home");
mkdirSync(isolatedHome, { recursive: true });
const env = {
  ...process.env,
  PI_CODING_AGENT_DIR: agentDir,
  PI_CODING_AGENT_SESSION_DIR: join(agentDir, "sessions"),
  PI_OFFLINE: "1",
  PI_TELEMETRY: "0",
  HOME: isolatedHome,
  USERPROFILE: isolatedHome,
};
const rpcArgs = [piCli, "--offline", "--no-session", "--no-tools", "--no-extensions", "--no-skills",
  "--no-context-files", "--no-prompt-templates", "--no-mcp", "-e", ".", "--mode", "rpc"];
const PROBE_TIMEOUT_MS = 15_000;
const CLEANUP_GRACE_MS = 1_000;

function runPiRpc({ promptIds = [], malformed = false }) {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, rpcArgs, {
      cwd: root,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let fullOutput = "";
    let lineBuffer = "";
    let promptIndex = 0;
    let deadlineExceeded = false;
    let settled = false;
    let childStarted = false;
    const closed = new Promise((resolveClose) => child.once("close", (code, signal) => resolveClose({ code, signal })));

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolveResult({ ...result, stdout, fullOutput, timedOut: deadlineExceeded });
    };
    const deadline = setTimeout(async () => {
      deadlineExceeded = true;
      child.kill();
      const exited = await Promise.race([
        closed.then(() => true),
        new Promise((resolveGrace) => setTimeout(() => resolveGrace(false), CLEANUP_GRACE_MS)),
      ]);
      if (!exited) child.kill();
      finish({ code: null, signal: "timeout", exitObserved: exited });
    }, PROBE_TIMEOUT_MS);

    function sendNextPrompt() {
      if (promptIndex >= promptIds.length) {
        child.stdin.end();
        return;
      }
      const id = promptIds[promptIndex++];
      child.stdin.write(`${JSON.stringify({ id, type: "prompt", message: `/${id.replace(/^(?:load|feature|reload)-/, "autotalk:")}` })}\n`);
    }

    function handleRecord(record) {
      if (record?.type === "extension_ui_request" && ["input", "select"].includes(record.method)) {
        const value = record.method === "input" ? "15" : "steer";
        child.stdin.write(`${JSON.stringify({ type: "extension_ui_response", id: record.id, value })}\n`);
      }
      if (record?.type === "response" && record.command === "prompt"
        && record.id === promptIds[promptIndex - 1]) {
        sendNextPrompt();
      }
    }

    function onStdout(chunk) {
      const text = chunk.toString();
      stdout += text;
      fullOutput += text;
      lineBuffer += text;
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) {
        try {
          handleRecord(JSON.parse(line));
        } catch {
          // Preserve diagnostics; non-JSON lines are not protocol records.
        }
      }
    }

    child.stdout.on("data", onStdout);
    child.stderr.on("data", (chunk) => { fullOutput += chunk.toString(); });
    child.stdin.on("error", () => {});
    child.once("error", (error) => finish({ code: null, signal: null, spawnError: error.message, exitObserved: false }));
    child.once("spawn", () => {
      childStarted = true;
      if (malformed) {
        child.stdin.end("not-json\n");
      } else {
        sendNextPrompt();
      }
    });
    child.once("close", (code, signal) => {
      if (lineBuffer.trim()) {
        try { handleRecord(JSON.parse(lineBuffer)); } catch {}
      }
      finish({ code, signal, exitObserved: childStarted });
    });
  });
}

function runNativeShell() {
  let result;
  if (process.platform === "win32") {
    const shell = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command",
      `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`], {
      cwd: root, env, encoding: "utf8", timeout: PROBE_TIMEOUT_MS, windowsHide: true,
    });
  } else {
    result = spawnSync("/bin/sh", ["-c", '"$1" "$2" --no-extensions --version',
      "pi-host-shell", process.execPath, piCli], {
      cwd: root, env, encoding: "utf8", timeout: PROBE_TIMEOUT_MS,
    });
  }
  const fullOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const exit_code = result.status ?? 1;
  const assertions = behaviorAssertions("host_shell", {
    responses: [], fullOutput, exit_code, expectedVersion: sdkVersions["@earendil-works/pi-coding-agent"],
  });
  return {
    name: "host_shell", command: "npm run smoke:pi", exit_code,
    passed: exit_code === 0 && !result.error && assertions.every((item) => item.passed),
    evidence: fullOutput.slice(-6000) || String(result.error?.message ?? "No output captured"), assertions,
    hasUnhandledError: UNHANDLED_ERROR_PATTERN.test(fullOutput),
    hasLoadError: EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput),
  };
}

function makeRpcCase(name, first, second, extra = {}) {
  const sessions = second ? [first, second] : [first];
  const fullOutput = sessions.map((item) => item.fullOutput).join("\n--- second Pi host ---\n");
  const responses = sessions.flatMap((item) => parseJsonLines(item.stdout));
  const exit_code = sessions.every((item) => item.code === 0 && !item.timedOut && !item.spawnError) ? 0 : 1;
  const exit_codes = sessions.map((item) => item.code);
  const assertions = behaviorAssertions(name, { responses, fullOutput, exit_code, exit_codes, ...extra });
  const hasUnhandledError = UNHANDLED_ERROR_PATTERN.test(fullOutput);
  const hasLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput);
  return {
    name, command: "npm run smoke:pi", exit_code,
    passed: exit_code === 0 && !hasUnhandledError && !hasLoadError
      && sessions.every((item) => item.exitObserved) && assertions.every((item) => item.passed),
    evidence: fullOutput.slice(-6000) || "No output captured", assertions,
    hasUnhandledError, hasLoadError,
  };
}

try {
  const loadHost = await runPiRpc({ promptIds: ["load-on", "load-off"] });
  const extensionLoad = makeRpcCase("extension_load", loadHost);

  const happyHost = await runPiRpc({ promptIds: ["feature-settings", "feature-on", "feature-off"] });
  const settingsPath = join(isolatedHome, ".pi", "agent", "extensions", "autotalk", "settings.json");
  let persistedSettings;
  try { persistedSettings = readJson(settingsPath); } catch { persistedSettings = null; }
  const happyPath = makeRpcCase("happy_path", happyHost, null, { persistedSettings });

  const errorHost = await runPiRpc({ malformed: true });
  const errorPath = makeRpcCase("error_path", errorHost);

  const firstReloadHost = await runPiRpc({ promptIds: ["reload-settings"] });
  const reloadedSettings = (() => {
    try { return readJson(settingsPath); } catch { return null; }
  })();
  const secondReloadHost = await runPiRpc({ promptIds: ["reload-on", "reload-off"] });
  const reloadCleanup = makeRpcCase("reload_cleanup", firstReloadHost, secondReloadHost, {
    persistedSettings: reloadedSettings,
  });

  const cases = [extensionLoad, happyPath, errorPath, reloadCleanup, runNativeShell()];
  const report = {
    schema_version: 1,
    verification_contract: VERIFICATION_CONTRACT,
    sdk_versions: sdkVersions,
    platform: process.platform,
    model_inference: "none; actual Pi RPC host handles AutoTalk commands using isolated settings",
    unhandled_errors: cases.filter((item) => item.hasUnhandledError).length,
    extension_load_errors: cases.filter((item) => item.hasLoadError
      || (item.name === "extension_load" && !item.passed)).length,
    cases: cases.map(({ hasUnhandledError, hasLoadError, ...item }) => item),
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  await import("node:fs/promises").then(({ writeFile }) => writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`));
  console.log(JSON.stringify({ verification_contract: VERIFICATION_CONTRACT, platform: process.platform,
    cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })) }));
  if (cases.some((item) => !item.passed)) process.exitCode = 1;
} finally {
  rmSync(agentDir, { recursive: true, force: true });
}
