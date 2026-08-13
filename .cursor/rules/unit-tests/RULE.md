---
description: Unit tests import createStream from helper.ts and keep PublicRotatingFileStream in sync with private class fields
globs: packages/rotating-file-stream/index.ts,packages/*/test/unit/**/*.ts
alwaysApply: false
---

# Package unit tests: helper `createStream` and internals view

This rule applies to **unit tests** under `packages/*/test/unit/` (and to `packages/rotating-file-stream/index.ts` when private members change). It does **not** apply to integration tests (`test/integration/`).

Production `RotatingFileStream` keeps internals **private**. Unit tests still need those fields. `unit/helper.ts` is the only allowed bridge.

## Layout

- Test files: `packages/*/test/unit/*.test.ts` (and `*.test-d.ts` for type tests)
- Shared helper: `packages/*/test/unit/helper.ts` (same folder as unit tests)

## Always import `createStream` from `helper.ts`

In unit tests that inspect internals, import `createStream` from `./helper.ts`, never from `../../index.ts`.

```ts
// ❌ BAD: production factory; return type hides private fields
import { createStream } from "../../index.ts";

// ✅ GOOD: unit-test factory; same runtime, widened type
import { createStream } from "./helper.ts";
```

Other public symbols (`RotatingFileStream`, `Options`, `FileSize`, …) may still be imported from `../../index.ts`. Only the **factory** must come from the unit helper.

Type tests that prove the **public** API does **not** expose internals should import `createStream` from `../../index.ts` for that assertion only; every other unit test uses `./helper.ts`.

## Keep helper `createStream` aligned with the original

`packages/rotating-file-stream/test/unit/helper.ts` re-exports a `createStream` that **must match** `packages/rotating-file-stream/index.ts` `createStream`:

- same overload list (classical vs standard, `rotate` present or absent);
- same type parameters and option types;
- same implementation: call the original, do not re-validate or wrap behavior.

Whenever the original `createStream` signature or overloads change, update the unit helper in the **same change**.

## Keep `PublicRotatingFileStream` aligned with private/protected members

`PublicRotatingFileStream` in `unit/helper.ts` is the test-visible shape of `RotatingFileStream` internals. That interface is the source of truth; do not copy the member list into this rule.

Whenever you add, rename, type-change, or remove a **private** or **protected** member on `RotatingFileStream`, update `PublicRotatingFileStream` in the **same change** so it lists exactly those members (name + type).

Do **not** make those members public on the class to satisfy tests. Unit tests read internals through `TestRotatingFileStream`, never via `any`.

## When adding a new unit file

Create it under `packages/*/test/unit/` with a descriptive name (for example `immutable.test.ts`). No changes to `vitest.config.ts` globs or this rule's `globs` are required.
