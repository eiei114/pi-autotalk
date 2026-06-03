# Pi AutoTalk

[![CI](https://github.com/eiei114/pi-autotalk/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-autotalk/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-autotalk/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-autotalk/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-autotalk.svg)](https://www.npmjs.com/package/pi-autotalk)
[![npm downloads](https://img.shields.io/npm/dm/pi-autotalk.svg)](https://www.npmjs.com/package/pi-autotalk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Timed AutoTalk for Pi: periodically send your editor thoughts to the agent for brainstorming.

Pi AutoTalk turns Pi's interactive editor into a lightweight thinking buffer. Turn it on, type rough notes or mutterings into the editor, and Pi periodically sends them back to the agent as an AutoTalk thought memo.

Status: **MVP implemented and locally dogfooded**. AutoTalk is always off by default and only runs after `/autotalk:on`.

## Why

Sometimes you do not want to craft a polished prompt. You want to think out loud, let the agent react, and keep moving. AutoTalk is for that mode:

- brainstorming while typing fragments
- talking through an idea before it becomes a task
- keeping momentum without repeatedly pressing submit
- asking Pi to reflect on your current train of thought

## What it does

When enabled, AutoTalk:

1. watches the interactive editor buffer;
2. waits until you have stopped typing for a short moment;
3. sends the full buffer on an interval;
4. wraps it in an `[AutoTalk]` thought-memo prefix;
5. clears the editor only if the text has not changed since it was read.

It is deliberately conservative. Slash commands are protected, enabled state is not persisted, and AutoTalk messages tell the agent not to edit files, run commands, or send external requests unless explicitly asked.

## Commands

| Command | Purpose |
|---|---|
| `/autotalk:on` | Start timed sending. Does not immediately send existing editor text. |
| `/autotalk:off` | Stop timed sending and clear AutoTalk footer status. |
| `/autotalk:mode` | Select busy-agent delivery mode: `followUp` or `steer`. |
| `/autotalk:settings` | Configure interval seconds and delivery mode. |

## Behavior details

### Sending interval

- Default: `10` seconds.
- Allowed range: `5` to `120` seconds.
- Settings UI rejects non-integers and out-of-range values.

### Typing guard

AutoTalk skips a tick if the editor changed within the last 2 seconds. This avoids sending half-typed fragments at the exact moment you are still writing.

### Slash-command guard

If the editor starts with `/`, AutoTalk pauses for that tick and does not clear the editor. This prevents commands like `/autotalk:off`, `/reload`, or `/model` from being auto-sent as thought memos.

### Safe clearing

After sending a non-empty buffer, AutoTalk clears the editor only if the editor still exactly matches the text that was sent. If you type more while a send is happening, the new text is preserved.

### Empty prompt

If the editor is empty, AutoTalk sends a one-shot continuation prompt:

```text
[AutoTalk]
The editor is empty. From the conversation so far, ask one question to think about next.
```

That empty prompt is sent only once. It resets after a real non-empty thought memo is sent.

### Busy-agent delivery modes

When the agent is already responding:

- `followUp` queues the thought memo after the current work finishes.
- `steer` sends it as steering input for the current stream.

Use `followUp` for orderly logs. Use `steer` for live brainstorming and course correction.

## AutoTalk message format

Non-empty editor text is sent like this:

```text
[AutoTalk]
This is an automatically sent user thought memo.
Expand the ideas, organize the key points, and ask one follow-up question.
Unless explicitly requested, do not edit files, run commands, or send external messages.

--- Thought memo ---
{editor text}
```

## Settings persistence

AutoTalk persists interval and delivery mode globally at:

```text
~/.pi/agent/extensions/autotalk/settings.json
```

Example:

```json
{
  "intervalSec": 10,
  "deliveryMode": "followUp"
}
```

The enabled/disabled state is **never persisted**. Every Pi session starts with AutoTalk off.

## Install

### From npm

```bash
pi install npm:pi-autotalk
```

### From GitHub

```bash
pi install git:github.com/eiei114/pi-autotalk
```

### Local development install

Clone or keep the repo under:

```text
C:/Users/Keisu/Projects/OSS/pi-autotalk
```

Then add it to a project `.pi/settings.json`:

```json
{
  "packages": [
    "..\\..\\..\\OSS\\pi-autotalk"
  ]
}
```

After editing settings, reload Pi:

```text
/reload
```

## Quick start

```text
/autotalk:on
```

Type a thought into the editor and stop typing. After the configured interval, Pi will receive it as an AutoTalk thought memo.

Useful commands:

```text
/autotalk:settings
/autotalk:mode
/autotalk:off
```

## Package contents

| Path | Purpose |
|---|---|
| `extensions/index.ts` | Pi extension entrypoint and command/timer wiring. |
| `lib/autotalk.ts` | Settings validation, persistence, and message formatting helpers. |
| `tests/` | Node test suite for package metadata, formatting, settings, and registration. |
| `docs/` | Release and publishing docs. |

## Development

```bash
npm install
npm run ci
```

`npm run ci` runs:

1. `tsc --noEmit`
2. `node --test tests/*.test.mjs`
3. `npm pack --dry-run`

## Security and privacy

AutoTalk intentionally sends editor contents to the active Pi agent. Treat it like an auto-submit feature.

Safety choices in the MVP:

- starts disabled on every launch;
- requires explicit `/autotalk:on`;
- never persists enabled state;
- pauses while the editor begins with `/`;
- does not clear the editor if new text appeared during send;
- frames messages as thought memos, not direct execution requests;
- asks the agent not to edit files, run commands, or send external requests unless explicitly requested.

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Release

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push --follow-tags
```

See [`docs/release.md`](docs/release.md) for setup details.

## Links

- npm: https://www.npmjs.com/package/pi-autotalk
- GitHub: https://github.com/eiei114/pi-autotalk
- Issues: https://github.com/eiei114/pi-autotalk/issues

## License

MIT
