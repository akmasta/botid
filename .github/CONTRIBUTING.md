# Contributing to BotID

Thanks for your interest in contributing to BotID.

## Getting Started

```sh
git clone https://github.com/akmasta/botid.git
cd botid
pnpm install
pnpm test
pnpm build
```

## Development

- `pnpm test` — run tests
- `pnpm test:watch` — run tests in watch mode
- `pnpm lint` — TypeScript type check
- `pnpm build` — compile (CJS + ESM + types)

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Add or update tests for any changed behavior
4. Ensure `pnpm test` and `pnpm lint` pass
5. Submit your PR

Keep PRs focused — one feature or fix per PR. This makes review faster.

## Code Style

- TypeScript with strict mode
- No unnecessary abstractions — keep it simple
- Tests go in `tests/` and mirror the source file name (e.g., `src/verify.ts` → `tests/verify.test.ts`)

## Issues

- **Bug reports:** Include steps to reproduce, expected vs actual behavior, and your Node.js version
- **Feature requests:** Describe the use case, not just the solution
- **Security issues:** See [SECURITY.md](SECURITY.md) — do not open public issues for vulnerabilities

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
