# Pi AutoTalk

[![CI](https://github.com/eiei114/pi-autotalk/actions/workflows/ci.yml/badge.svg)](https://github.com/eiei114/pi-autotalk/actions/workflows/ci.yml)
[![Publish](https://github.com/eiei114/pi-autotalk/actions/workflows/publish.yml/badge.svg)](https://github.com/eiei114/pi-autotalk/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/pi-autotalk.svg)](https://www.npmjs.com/package/pi-autotalk)
[![npm downloads](https://img.shields.io/npm/dm/pi-autotalk.svg)](https://www.npmjs.com/package/pi-autotalk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)
[![Trusted Publishing](https://img.shields.io/badge/npm-Trusted%20Publishing-blue.svg)](docs/release.md)

> Timed AutoTalk for Pi: periodically send your editor thoughts to the agent for brainstorming.

> Status: scaffolded / not implemented yet. This repository was created from the Pi extension template; the AutoTalk feature is specified but still pending implementation.

## What this is

Pi AutoTalk will add a local Pi extension that reads the interactive editor buffer on a timer, sends it as an AutoTalk thought memo, and clears the editor after safe delivery. It is meant for low-friction brainstorming: speak or type half-formed thoughts, let Pi respond, then keep thinking.

## Planned features

- `/autotalk:on` and `/autotalk:off` to explicitly start and stop timed sending.
- `/autotalk:mode` to choose busy-agent delivery: `followUp` or `steer`.
- `/autotalk:settings` to configure interval seconds and delivery mode.
- Safety pause when the editor starts with `/`, so slash commands are not auto-sent.
- AutoTalk prefix that frames sent text as a thought memo and discourages tool use unless explicitly requested.

## Planned install

```bash
pi install npm:pi-autotalk
```

Or install from GitHub:

```bash
pi install git:github.com/eiei114/pi-autotalk
```

## Planned quick start

Try this package locally:

```bash
pi -e .
```

Then run:

```txt
/autotalk:on
/autotalk:settings
/autotalk:mode
/autotalk:off
```

## Package contents

| Path | Purpose |
|---|---|
| `extensions/` | Pi TypeScript extension entrypoints (`*.ts` and `index.ts`) |
| `lib/` | Shared TypeScript helpers |
| `skills/` | Agent Skills |
| `prompts/` | Prompt templates |
| `themes/` | Pi themes |
| `docs/` | Release and setup docs |

## Development

```bash
npm install
npm run ci
```

## Release

This package is set up for npm Trusted Publishing, so no `NPM_TOKEN` is required.

```bash
npm version patch
git push --follow-tags
```

See [`docs/release.md`](docs/release.md) for setup details.

## Template checklist

After creating a repository from this template, follow [`docs/template-checklist.md`](docs/template-checklist.md).

More docs:

- [`docs/typescript.md`](docs/typescript.md)
- [`docs/examples.md`](docs/examples.md)
- [`docs/github-template.md`](docs/github-template.md)
- [`docs/repository-settings.md`](docs/repository-settings.md)

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

AutoTalk is a deliberate auto-send feature. The planned MVP starts disabled on every Pi launch, pauses while slash commands are being typed, and does not persist the enabled state globally.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/pi-autotalk
- GitHub: https://github.com/eiei114/pi-autotalk
- Issues: https://github.com/eiei114/pi-autotalk/issues

## License

MIT
