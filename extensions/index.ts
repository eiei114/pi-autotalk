import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_SETTINGS,
  formatEmptyPrompt,
  formatThoughtMemo,
  IDLE_BEFORE_SEND_MS,
  loadSettings,
  normalizeInterval,
  saveSettings,
  WATCH_EDITOR_MS,
  type AutoTalkSettings,
  type DeliveryMode,
} from "../lib/autotalk.ts";

type Timer = ReturnType<typeof setInterval>;

export default function (pi: ExtensionAPI) {
  let settings: AutoTalkSettings = { ...DEFAULT_SETTINGS };
  let enabled = false;
  let tickTimer: Timer | undefined;
  let editorWatcher: Timer | undefined;
  let latestContext: ExtensionContext | undefined;
  let lastObservedEditorText = "";
  let lastInputChangeAt = Date.now();
  let emptyPromptSent = false;
  let sending = false;

  function updateStatus(ctx = latestContext): void {
    if (!ctx?.hasUI) return;

    if (!enabled) {
      ctx.ui.setStatus("autotalk", undefined);
      return;
    }

    ctx.ui.setStatus(
      "autotalk",
      ctx.ui.theme.fg("accent", "AutoTalk") +
        ctx.ui.theme.fg("dim", ` on ${settings.intervalSec}s ${settings.deliveryMode}`),
    );
  }

  function clearTimers(): void {
    if (tickTimer) clearInterval(tickTimer);
    if (editorWatcher) clearInterval(editorWatcher);
    tickTimer = undefined;
    editorWatcher = undefined;
  }

  function observeEditor(ctx = latestContext): void {
    if (!ctx?.hasUI) return;

    const current = ctx.ui.getEditorText();
    if (current !== lastObservedEditorText) {
      lastObservedEditorText = current;
      lastInputChangeAt = Date.now();
    }
  }

  function sendUserMessage(ctx: ExtensionContext, text: string): void {
    if (ctx.isIdle()) {
      pi.sendUserMessage(text);
      return;
    }

    pi.sendUserMessage(text, { deliverAs: settings.deliveryMode });
  }

  function startTimers(ctx: ExtensionContext): void {
    clearTimers();
    latestContext = ctx;
    lastObservedEditorText = ctx.hasUI ? ctx.ui.getEditorText() : "";
    lastInputChangeAt = Date.now();

    editorWatcher = setInterval(() => observeEditor(), WATCH_EDITOR_MS);
    tickTimer = setInterval(() => {
      void tick();
    }, settings.intervalSec * 1_000);
  }

  async function tick(): Promise<void> {
    const ctx = latestContext;
    if (!enabled || sending || !ctx?.hasUI) return;

    observeEditor(ctx);

    if (Date.now() - lastInputChangeAt < IDLE_BEFORE_SEND_MS) return;

    const editorText = ctx.ui.getEditorText();

    if (editorText.startsWith("/")) return;

    if (editorText.trim() === "") {
      if (emptyPromptSent) return;

      try {
        sending = true;
        sendUserMessage(ctx, formatEmptyPrompt());
        emptyPromptSent = true;
      } finally {
        sending = false;
      }
      return;
    }

    const textToSend = editorText;

    try {
      sending = true;
      sendUserMessage(ctx, formatThoughtMemo(textToSend));
      emptyPromptSent = false;

      if (ctx.ui.getEditorText() === textToSend) {
        ctx.ui.setEditorText("");
        lastObservedEditorText = "";
        lastInputChangeAt = Date.now();
      } else {
        observeEditor(ctx);
      }
    } finally {
      sending = false;
    }
  }

  function requireUi(ctx: ExtensionCommandContext): boolean {
    if (ctx.hasUI) return true;
    ctx.ui.notify("AutoTalk requires Pi interactive UI.", "warning");
    return false;
  }

  function enable(ctx: ExtensionCommandContext): void {
    if (!requireUi(ctx)) return;

    enabled = true;
    emptyPromptSent = false;
    startTimers(ctx);
    updateStatus(ctx);
  }

  function disable(ctx = latestContext): void {
    enabled = false;
    clearTimers();
    updateStatus(ctx);
  }

  async function setMode(ctx: ExtensionCommandContext): Promise<void> {
    if (!requireUi(ctx)) return;

    const choice = await ctx.ui.select("AutoTalk delivery mode:", ["followUp", "steer"]);
    if (choice !== "followUp" && choice !== "steer") return;

    settings = { ...settings, deliveryMode: choice as DeliveryMode };
    await saveSettings(settings);
    updateStatus(ctx);
  }

  async function openSettings(ctx: ExtensionCommandContext): Promise<void> {
    if (!requireUi(ctx)) return;

    const intervalInput = await ctx.ui.input(
      "AutoTalk interval seconds (5-120):",
      String(settings.intervalSec),
    );
    if (intervalInput === undefined) return;

    const intervalSec = normalizeInterval(intervalInput.trim());
    if (intervalSec === undefined) {
      ctx.ui.notify("Interval must be an integer from 5 to 120 seconds.", "warning");
      return;
    }

    const mode = await ctx.ui.select("AutoTalk delivery mode:", ["followUp", "steer"]);
    if (mode !== "followUp" && mode !== "steer") return;

    settings = { intervalSec, deliveryMode: mode as DeliveryMode };
    await saveSettings(settings);

    if (enabled) startTimers(ctx);
    updateStatus(ctx);
  }

  pi.on("session_start", async (_event, ctx) => {
    latestContext = ctx;
    settings = await loadSettings();
    enabled = false;
    clearTimers();
    updateStatus(ctx);
  });

  pi.on("session_shutdown", () => {
    enabled = false;
    clearTimers();
  });

  pi.registerCommand("autotalk:on", {
    description: "Start AutoTalk timed editor sending",
    handler: async (_args, ctx) => {
      enable(ctx);
    },
  });

  pi.registerCommand("autotalk:off", {
    description: "Stop AutoTalk timed editor sending",
    handler: async (_args, ctx) => {
      disable(ctx);
    },
  });

  pi.registerCommand("autotalk:mode", {
    description: "Choose AutoTalk busy-agent delivery mode",
    handler: async (_args, ctx) => {
      await setMode(ctx);
    },
  });

  pi.registerCommand("autotalk:settings", {
    description: "Configure AutoTalk interval and delivery mode",
    handler: async (_args, ctx) => {
      await openSettings(ctx);
    },
  });
}
