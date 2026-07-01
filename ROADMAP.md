# pi-autotalk Roadmap

## Current Status: MVP ✅

pi-autotalk 0.1.3 is a working MVP that has been locally dogfooded. Core functionality is solid and production-ready.

## Completed

- [x] Timed editor watching with configurable interval (5–120s)
- [x] Typing guard (2s idle before send)
- [x] Slash-command guard (preserves `/` commands)
- [x] Safe editor clearing (only if unchanged during send)
- [x] Empty-prompt mode (single "ask one question" continuation)
- [x] Two busy-agent delivery modes: `followUp` and `steer`
- [x] Settings persistence (`~/.pi/agent/extensions/autotalk/settings.json`)
- [x] Enabled state never persisted (starts off every session)
- [x] Four slash commands: `/autotalk:on`, `:off`, `:mode`, `:settings`
- [x] CI/CD with TypeScript typecheck, tests, npm pack check
- [x] npm Trusted Publishing with auto-release on version bump
- [x] Dependabot configured for weekly updates
- [x] Dependency audit clean (0 vulnerabilities as of 2026-07-01)

## Short-term (next 1–2 releases)

- [ ] **AutoTalk indicator**: Show "AutoTalk is ON" in a more visible widget (e.g., editor header or footer badge) rather than only the status line.
- [ ] **Per-session pause**: Add `/autotalk:pause` to temporarily suspend sending without disabling completely (resume with `/autotalk:resume`).
- [ ] **Send confirmation**: Optionally show a quick confirmation dialog before sending the editor text (opt-in, off by default).

## Medium-term

- [ ] **Multiple thought-memo templates**: Let users choose or customize the AutoTalk prefix message via a settings file or command.
- [ ] **Word-count threshold**: Only send when the editor exceeds a minimum word count, ignoring trivial fragments.
- [ ] **Agent-triggered pull**: Allow the agent to request the current editor buffer on demand (e.g., "what are you typing?").
- [ ] **Message styling**: Support sending structured content (code blocks, lists) rather than plain text only.

## Long-term / Exploratory

- [ ] **Multi-buffer support**: Watch multiple open editor buffers or files.
- [ ] **Voice-to-text integration**: Transcribe microphone input through a local STT engine and pipe into AutoTalk.
- [ ] **Session summaries**: Periodically send a compact thought-memo summarizing the recent conversation context.
- [ ] **Rate-limit-aware backoff**: If the agent is busy for an extended period, reduce send frequency rather than queuing indefinitely.

## Non-goals

- Persistent enabled state across sessions (by design — safety choice)
- Sending while the editor starts with `/` (by design — command protection)
- File-system or network access from AutoTalk messages (by design — agent instruction)

---

*Last updated: 2026-07-01*
