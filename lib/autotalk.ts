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

export function getSettingsPath(): string {
  return join(homedir(), ".pi", "agent", "extensions", "autotalk", "settings.json");
}

export function isDeliveryMode(value: unknown): value is DeliveryMode {
  return value === "followUp" || value === "steer";
}

export function normalizeSettings(value: unknown): AutoTalkSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };

  const candidate = value as { intervalSec?: unknown; deliveryMode?: unknown };
  const intervalSec = normalizeInterval(candidate.intervalSec) ?? DEFAULT_SETTINGS.intervalSec;
  const deliveryMode = isDeliveryMode(candidate.deliveryMode)
    ? candidate.deliveryMode
    : DEFAULT_SETTINGS.deliveryMode;

  return { intervalSec, deliveryMode };
}

export function normalizeInterval(value: unknown): number | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return normalizeInterval(Number(value));
  }

  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (value < MIN_INTERVAL_SEC || value > MAX_INTERVAL_SEC) return undefined;
  return value;
}

export async function loadSettings(path = getSettingsPath()): Promise<AutoTalkSettings> {
  try {
    const text = await readFile(path, "utf8");
    return normalizeSettings(JSON.parse(text));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(
  settings: AutoTalkSettings,
  path = getSettingsPath(),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(settings, null, 2)}
`, "utf8");
}

export function formatThoughtMemo(text: string): string {
  return `[AutoTalk]
これは自動送信されたユーザーの思考メモです。
アイデアを広げ、論点を整理し、次の問いを1つ出してください。
明示依頼でない限り、ファイル編集・コマンド実行・外部送信はしないでください。

--- 思考メモ ---
${text}`;
}

export function formatEmptyPrompt(): string {
  return `[AutoTalk]
入力欄が空です。ここまでの流れから、次に考える問いを1つ出してください。`;
}
