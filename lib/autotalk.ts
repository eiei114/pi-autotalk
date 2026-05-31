import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type DeliveryMode = "followUp" | "steer";

export interface AutoTalkSettings {
  intervalSec: number;
  deliveryMode: DeliveryMode;
}

export const DEFAULT_INTERVAL_SEC = 10;
export const MIN_INTERVAL_SEC = 5;
export const MAX_INTERVAL_SEC = 120;
export const IDLE_BEFORE_SEND_MS = 2_000;
export const WATCH_EDITOR_MS = 250;

export const DEFAULT_SETTINGS: AutoTalkSettings = {
  intervalSec: DEFAULT_INTERVAL_SEC,
  deliveryMode: "followUp",
};

/** Path to the global AutoTalk settings JSON file under `~/.pi`. */
export function getSettingsPath(): string {
  return join(homedir(), ".pi", "agent", "extensions", "autotalk", "settings.json");
}

/** Returns true when `value` is a supported AutoTalk delivery mode. */
export function isDeliveryMode(value: unknown): value is DeliveryMode {
  return value === "followUp" || value === "steer";
}

/** Coerces unknown persisted settings into a valid `AutoTalkSettings` object. */
export function normalizeSettings(value: unknown): AutoTalkSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };

  const candidate = value as { intervalSec?: unknown; deliveryMode?: unknown };
  const intervalSec = normalizeInterval(candidate.intervalSec) ?? DEFAULT_SETTINGS.intervalSec;
  const deliveryMode = isDeliveryMode(candidate.deliveryMode)
    ? candidate.deliveryMode
    : DEFAULT_SETTINGS.deliveryMode;

  return { intervalSec, deliveryMode };
}

/** Parses an interval in seconds; returns `undefined` when out of range or invalid. */
export function normalizeInterval(value: unknown): number | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return normalizeInterval(Number(value));
  }

  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < MIN_INTERVAL_SEC || value > MAX_INTERVAL_SEC) return undefined;
  return value;
}

/** Loads settings from disk, falling back to defaults when the file is missing or invalid. */
export async function loadSettings(path = getSettingsPath()): Promise<AutoTalkSettings> {
  try {
    const text = await readFile(path, "utf8");
    return normalizeSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Persists settings as formatted JSON, creating parent directories when needed. */
export async function saveSettings(
  settings: AutoTalkSettings,
  path = getSettingsPath(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}
`, "utf8");
}

/** Wraps editor text in the AutoTalk thought-memo prompt sent to the agent. */
export function formatThoughtMemo(text: string): string {
  return `[AutoTalk]
This is an automatically sent user thought memo.
Expand the ideas, organize the key points, and ask one follow-up question.
Unless explicitly requested, do not edit files, run commands, or send external messages.

--- Thought memo ---
${text}`;
}

/** Returns the one-shot empty-editor continuation prompt. */
export function formatEmptyPrompt(): string {
  return `[AutoTalk]
The editor is empty. From the conversation so far, ask one question to think about next.`;
}
