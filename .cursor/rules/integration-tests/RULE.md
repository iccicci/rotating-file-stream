---
description: Integration tests use helper.ts, real createStream, and live filesystem scenarios under test/integration/
globs: packages/*/test/integration/**/*.ts
alwaysApply: false
---

# Package integration tests: filesystem scenarios

This rule applies to **integration tests** under `packages/*/test/integration/`. It does **not** apply to unit tests (`test/unit/`).

Integration tests exercise the real `createStream` from `../../index.ts` via `integration/helper.ts` (never via `unit/helper.ts`). Import `createStream` in a test file only for **types** from `../unit/helper.ts` when patching internals mid-scenario (see `interval.test.ts`).

## Layout

- Test files: `packages/*/test/integration/*.test.ts`
- Shared helper: `packages/*/test/integration/helper.ts` (same folder as integration tests)

## Always use `helper.ts`

Each integration file calls `useIntegrationSuite()` once at module scope, then registers scenarios with `integrationTest({ ... })`.

```ts
// ✅ GOOD
import { integrationTest, useIntegrationSuite } from "./helper.ts";

useIntegrationSuite();

integrationTest({
  description: "example",
  events: [["_construct"], ["open", "test.log"], ["close"]],
  run: rfs => {
    rfs.end("test\n");
  },
  stream: ["test.log", { size: "10B" }]
});
```

```ts
// ❌ BAD: unit helper skips _construct / filesystem open
import { createStream } from "../unit/helper.ts";
```

## Vitest mocks and isolation

- Use Vitest mocking APIs (`vi.fn`, `vi.spyOn`, `vi.mock`, fake timers, …); do not copy reference-test custom mock systems from root `test/`.
- `useIntegrationSuite()` provides a per-file temp directory, `chdir`, and `afterEach` cleanup so files can run in parallel.
- One reference `describe` scenario → one `integrationTest({ description: ... })`; nested behavioral checks belong in `assert` / `files`, not extra top-level `it` cases for the same scenario.

## Generator `index`

Assert file names and `index` values from the README, not from root `index.ts` / `test/*`.

## When adding a new integration file

Create it under `packages/*/test/integration/` with a descriptive name (for example `history.test.ts`). No changes to `vitest.config.ts` globs are required.
