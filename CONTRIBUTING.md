# Contributing to axctl

Thanks for your interest in contributing to axctl — a CLI for managing Axis cameras from the terminal. Whether it's a bug fix, new command, or documentation improvement, contributions are welcome.

## Quick Start

```bash
git clone https://github.com/oneshot2001/axctl.git && cd axctl
bun install
bun run dev          # run from source
bun test             # run the test suite (45 tests)
bun run typecheck    # TypeScript strict mode check
```

Requires [Bun](https://bun.sh) ≥ 1.1.

## Ways to Contribute

- **Bug reports** — Open an issue with steps to reproduce, camera model, and AXIS OS version.
- **Feature requests** — Open an issue describing the use case. "I want to do X with my cameras" is more useful than "add Y flag."
- **New commands** — See the architecture section below. Each command group lives in its own file under `src/cli/`.
- **Camera compatibility** — Tested against a camera model not listed in the README? Let us know.
- **Documentation** — Typo fixes, better examples, or new guides are always appreciated.

## Development Workflow

1. **Fork** the repo and create a feature branch from `main`.
2. **Write code** — follow the existing patterns in `src/cli/` for commands and `src/lib/` for core logic.
3. **Add tests** — new functionality should include tests in `tests/`. Run `bun test` to confirm.
4. **Type check** — run `bun run typecheck` before submitting. The project uses TypeScript strict mode.
5. **Open a PR** — describe what changed and why. Link any related issues.

## Code Style

- TypeScript strict mode, no `any` types unless absolutely necessary.
- Use the existing VAPIX client (`src/lib/vapix-client.ts`) for all camera HTTP communication.
- All camera interactions use HTTP Digest Authentication — never send credentials in plaintext.
- Output goes through the formatter pipeline (`src/formatters/index.ts`) to support `--format` flags.
- Keep commands stateless per invocation. Persistent state lives in `~/.config/axctl/` via Conf.

## Testing Without Hardware

Not everyone has Axis cameras on hand. You can still contribute:

- **Unit tests** — the test suite mocks VAPIX responses. See `tests/aoa-client.test.ts` for examples.
- **Formatter/CLI tests** — don't require network access at all.
- **Documentation and refactors** — always valuable regardless of hardware access.

If you're testing against real hardware, please include the camera model and AXIS OS version in your PR description.

## Commit Messages

Keep them concise and descriptive. No strict convention, but prefer:

```
feat: add firmware upgrade command
fix: handle digest auth with empty qop
docs: add troubleshooting section for mDNS discovery
```

## Issues and Discussions

- Search existing issues before opening a new one.
- For questions or ideas that aren't bugs, open a Discussion instead.
- Be specific — "it doesn't work" isn't actionable. Include the command you ran, expected output, and actual output.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
