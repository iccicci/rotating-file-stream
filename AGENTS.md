# Project context: current initiative

This repository is undergoing a coordinated modernization. Treat the workstreams below as the active roadmap until they are completed and this file is updated.

Follow `.cursor/rules/local-toolchain/RULE.md` for all shell commands (`.nvmrc`, yarn, local ESLint/TypeScript).

---

## Scope of agent work (strict)

**Until this initiative is finished, treat the whole project as incomplete / in progress.**

Agents must **only** make the changes required to satisfy the human’s explicit request.

Do **not**:

- remove unused or not-yet-exported symbols, dead code, or “incomplete” stubs just because they look unfinished;
- refactor, tidy, or “fix” areas outside the request;
- expand scope to nearby files, APIs, or workstreams that were not asked for;
- preemptively complete unfinished rewrite pieces unless the human asked for that piece.

Partial, transitional, or unused code is expected during this modernization. Leave it alone unless the request targets it.

---

## Zero runtime dependencies (mandatory)

The published package `rotating-file-stream` (`packages/rotating-file-stream`) has **no external dependencies** and **must keep having none**.

Agents must **never**:

- add `dependencies`, `optionalDependencies`, or `peerDependencies` to `packages/rotating-file-stream/package.json`;
- import or require any third-party package from the library’s published source (only Node.js built-ins are allowed);
- introduce a transitive runtime dependency by any other means (bundling, re-exporting, vendoring a package that would ship as a dependency, etc.).

Monorepo-root and other workspace **dev** tooling (`devDependencies` for tests, lint, build, CI) is fine and stays at the root (or in non-published packages). That does **not** relax the rule for the published library itself.

If a feature seems to need an external library, implement it with Node built-ins or decline / ask the human; do not add a dependency.

---

## Original sources (reference only)

The root library and tests remain in the repository as examples / living documentation of the pre-modernization behavior:

- `index.ts` (repository root only)
- `test/*` (repository root `test/` only; including `test/helper.ts`)

**Do not modify these files.** Active development happens under the monorepo packages (and related CI, docs, and layout). At the end of this initiative they are intended to be removed.

**Do read them** whenever changing library or test code (rewrite, Vitest port, behavior-sensitive fixes). Use them as the behavioral contract, **except** where this file records an intentional discrepancy with the new README (see **Generator `index`** below). Skip them for work that only touches CI, documentation, repository structure, tooling config, or similar non-code paths.

### Generator `index` (intentional discrepancy)

The README (`filename(args)` / `index`) is the contract for the rewrite. Root `index.ts` and `test/*` do **not** match that contract; do **not** copy their `index` behavior into `packages/rotating-file-stream`.

Documented behavior (implement this):

- `index` distinguishes _rotated file names_ when more than one rotation happens in the same `options.interval` window because `options.size` was reached more than once (`time` stays the same).
- `index` is also passed when only `options.interval` is set, and when only `options.size` is set, as a safeguard if the generated name already exists.
- `options.size` is necessary and sufficient for `index` to start from `1`; when `options.size` is not set, `index` starts from `0`.
- A generator may omit `index` from the file name when it is `0`.

Reference behavior (do **not** reproduce): the original library typically starts `index` at `1` in those paths and the default generator always interpolates a padded `index` into the name. The rewrite default generator omits `index` when it is `0` and does not zero-pad it.

When porting tests, keep the scenarios from root `test/*` but assert the documented `index` values and file names, not the reference ones.

**Test generators (new and migrated):** when a package test uses a custom `StandardGenerator`, the rotated file name must depend on **both** `args.time` and `args.index` (same contract as the README and the default generator). Do **not** copy reference-test generators that omit one of the two; for example names like `1-test.log` that use only `index`. Rewrite the generator and update expected events, paths, and file contents to match. Exception: tests whose **subject** is generator behavior (validation, wrong signature, deliberate bad names, exhaustion traps, and similar) may keep intentionally incorrect generators.

**Do not include them in active tooling** until they are deleted for good:

- ESLint must not target them: linted paths come only from `tsconfig.eslint.json` `include` (consumed by `eslint.config.js`); never root `index.ts` / `test/**`.
- Vitest, `yarn build`, coverage, and CI must not run against them.
- Prefer package paths such as `packages/*/test/**` when extending `tsconfig.eslint.json` `include`.

When these originals are finally removed, no special root excludes are needed anymore.

---

## Vitest mocks (mandatory for new tests)

The reference tests under root `test/` were written long ago and use **custom, hand-rolled mocking** (helpers, injectable hooks on the class, ad-hoc stubs, and similar patterns from that era).

When porting or writing tests under `packages/*/test/` for Vitest:

- **Unit tests** live in `packages/*/test/unit/*.test.ts` (type tests: `*.test-d.ts` in the same folder). Use `unit/helper.ts`.
- **Integration tests** live in `packages/*/test/integration/*.test.ts`. Use `integration/helper.ts` and the real `createStream`.

- **Do not** copy or reintroduce those custom mock systems.
- **Do** use Vitest’s modern mocking APIs (`vi.fn`, `vi.spyOn`, `vi.mock`, `vi.stubGlobal`, module mocks, fake timers, and related helpers as appropriate).
- **Do** keep files independently runnable under Vitest’s default file parallelism; use setup/teardown for isolation instead of a global sequencer or `99clean`-style ordered cleanup.
- Preserve the **behavioral contract** of the reference tests (what they assert), not their mocking style or execution-order tricks. Exception: generator `index` follows the README, not root `test/*` (see **Generator `index`** above); custom test generators must use both `time` and `index` in rotated names unless the scenario tests generator failure.

The old `test/` files remain reference-only and must not be edited to “modernize” their mocks in place.

---

## Integration test migration (`test/02`-`09`)

Port the reference integration scenarios from root `test/02write.test.ts` through `test/09history.test.ts` into **new** files under `packages/rotating-file-stream/test/integration/`. Do **not** fold them into `createStream.test.ts` (that file is unit tests under `test/unit/`). Do **not** edit the reference files.

Use `packages/rotating-file-stream/test/integration/helper.ts` (`useIntegrationSuite`, `integrationTest`) and the real `createStream` from `packages/rotating-file-stream/index.ts`. Follow **Vitest mocks**, **Generator `index`** (including **Test generators**), and **Production-like `RotatingFileStream`** above. One reference `describe` scenario becomes one `integrationTest({ description: ... })` (nested `it("events")` / `it("file content")` stay inside the helper, not as extra Vitest cases).

**Keep this section updated in the same change as every port.** While a reference file still has unmigrated scenarios, list them under that file (migrated vs not). When **every** scenario from a reference file has been ported, **collapse that file’s list** to a single line: all tests from that reference file have been migrated (and name the destination file). Do not leave a completed checklist in place.

Suggested destinations (create the package file when the first scenario from that reference file is ported):

| Reference                    | Package file                                                         |
| ---------------------------- | -------------------------------------------------------------------- |
| `test/02write.test.ts`       | `packages/rotating-file-stream/test/integration/write.test.ts`       |
| `test/03size.test.ts`        | `packages/rotating-file-stream/test/integration/size.test.ts`        |
| `test/04errors.test.ts`      | `packages/rotating-file-stream/test/integration/errors.test.ts`      |
| `test/05options.test.ts`     | `packages/rotating-file-stream/test/integration/options.test.ts`     |
| `test/06interval.test.ts`    | `packages/rotating-file-stream/test/integration/interval.test.ts`    |
| `test/07compression.test.ts` | `packages/rotating-file-stream/test/integration/compression.test.ts` |
| `test/08classical.test.ts`   | `packages/rotating-file-stream/test/integration/classical.test.ts`   |
| `test/09history.test.ts`     | `packages/rotating-file-stream/test/integration/history.test.ts`     |

### `test/02write.test.ts` → `write.test.ts`

All tests from that reference file have been migrated to `packages/rotating-file-stream/test/integration/write.test.ts`.

### `test/03size.test.ts` → `size.test.ts`

All tests from that reference file have been migrated to `packages/rotating-file-stream/test/integration/size.test.ts`.

### `test/04errors.test.ts` → `errors.test.ts`

All tests from that reference file have been migrated to `packages/rotating-file-stream/test/integration/open.test.ts`, `packages/rotating-file-stream/test/integration/errors.test.ts`, and `packages/rotating-file-stream/test/integration/immutable.test.ts`.

### `test/05options.test.ts` → `options.test.ts`

All tests from that reference file have been migrated to `packages/rotating-file-stream/test/integration/size.test.ts`, `packages/rotating-file-stream/test/integration/options.test.ts`, `packages/rotating-file-stream/test/integration/immutable.test.ts`, `packages/rotating-file-stream/test/unit/createStream.test.ts`, and `packages/rotating-file-stream/test/unit/intervalBounds.test.ts`.

### `test/06interval.test.ts` → `interval.test.ts`

All tests from that reference file have been migrated to `packages/rotating-file-stream/test/integration/interval.test.ts` (behavioral) and `packages/rotating-file-stream/test/unit/intervalBounds.test.ts` (UTC / DST boundary checks).

### `test/07compression.test.ts` → `compression.test.ts`

All tests from that reference file have been migrated to `packages/rotating-file-stream/test/integration/compression.test.ts` and `packages/rotating-file-stream/test/unit/compression.test.ts` (including **error while closing gzip**).

### `test/08classical.test.ts` → `classical.test.ts`

All tests from that reference file have been migrated to `packages/rotating-file-stream/test/integration/classical.test.ts` and `packages/rotating-file-stream/test/unit/classical.test.ts`.

### `test/09history.test.ts` → `history.test.ts`

All tests from that reference file have been migrated to `packages/rotating-file-stream/test/integration/history.test.ts` and `packages/rotating-file-stream/test/unit/history.test.ts`.

---

---

## Production-like `RotatingFileStream` (mandatory)

`RotatingFileStream` must stay as **production-like** as practical: prefer a small public surface (Writable API, events, factory `createStream`) and keep internals (`generator`, `options` / `InternalOptions`, file handles, timers, injectable hooks for I/O, …) **private**.

Do **not** make fields public only to make tests easier. Do **not** use `any` casts on the stream instance in package tests (that was the obsolete reference-test style).

When tests need to inspect private fields:

1. Export types needed for the widened view when appropriate (for example `InternalOptions`).
2. In the test helper, define a local widened type. Because TypeScript reduces
   `ClassWithPrivateField & { field: ... }` to `never`, first map the instance through a public view
   (e.g. `{ [K in keyof T]: T[K] }`) then intersect the private fields you need, and cast with
   `asTestStream(stream)` via `unknown`.
3. Reuse this same approach for future private internals (widen only in unit-test files under `packages/*/test/unit/` / `packages/*/test/unit/helper.ts`).

Type tests should assert the **public** type does not expose those fields; use `asTestStream` only where the test intentionally checks internals.

---

## `packages/rotating-file-stream/index.ts` docblocks (mandatory)

Treat `packages/rotating-file-stream/index.ts` as published-library source that must keep its `/** */`
documentation **current at all times**.

When adding or changing anything defined there (classes, functions, overloads, interfaces, type aliases,
constants with package semantics, and similar top-level definitions):

- update or add the corresponding `/** */` docblock in the same change;
- keep the description **definitive**, not provisional: do **not** write “temporary”, “dummy”,
  “placeholder”, “for now”, or similar wording in the docblock just because the implementation is still WIP;
- describe the intended public or internal role of the definition as it should remain in the final package,
  even if the implementation is still partial;
- if a definition is intentionally reserved for upcoming rewrite work, document that stable intent clearly
  instead of documenting the current incompleteness;
- do not leave stale docblocks after refactors, renames, overload changes, or signature changes.

This requirement is about the docblocks themselves. It does **not** require expanding scope or finishing
unfinished runtime behavior unless the human explicitly asked for that work.

---

## Dual README (temporary; keep in sync)

During this modernization initiative only, user-facing documentation exists as **two identical copies**:

- `README.md` (repository root)
- `packages/rotating-file-stream/README.md`

**Any change to one must be applied to the other in the same change.** Do not update only one copy.

This arrangement is **temporary**. Elsewhere in the repository (rules, docblocks, commit messages, and so on) refer to **the README** or **the documentation**; not to “dual README”. When the monorepo transition ends and a single README location remains, delete this section from `AGENTS.md`.

---

## Workstreams

### 1. CI: GitHub Actions

**Current state**

- `.github/workflows/build.yml` job `versions` declares:
  - `node`: versions that run **coverage** and **build** (today `22`, `24`, `26`);
  - `codecov_node`: the single version whose `lcov` is uploaded to Codecov (today `26`).
- Jobs `coverage` and `build` share that `node` matrix (in parallel).
- Job `codecov` runs after `coverage` and uploads only the artifact from `codecov_node`.
- `TZ=Europe/Rome` is set for the workflow.

**Target**

- Keep GitHub Actions as the only CI.
- When Node support changes, update only the `versions` job outputs (and keep `.nvmrc` aligned with `codecov_node` / local latest).

**Notes**

- Prefer official GitHub Actions for Node setup.

---

### 2. Coverage: Codecov

**Current state**

- Coverage output: `coverage/lcov.info` (Vitest via `yarn coverage`).
- GitHub Actions: `coverage` / `build` use the shared `node` matrix from job `versions`; `codecov` uploads only the report from `codecov_node`.
- `codecov.yml` enforces project and patch coverage at **100%** with **0%** threshold.

**Target**

- Keep Codecov as the coverage gate for PRs (status checks required in GitHub branch protection).
- Keep generating `lcov.info` for Codecov (Vitest coverage reporter).

**Notes**

- Upload uses `codecov/codecov-action` with `coverage/lcov.info` and `CODECOV_TOKEN` in GitHub secrets.
- Codecov’s own GitHub checks (`project` / `patch`) are configured in `codecov.yml`, not only by the Actions job name.

---

### 3. Repository layout: monorepo

**Current state**

- Yarn workspaces monorepo; package under `packages/rotating-file-stream`.
- Root `package.json` is private (`rotating-file-stream-monorepo`) and holds shared scripts / dev tooling.
- Root `index.ts` / `test/*` remain as reference-only originals.

**Target**

- Continue evolving the Yarn workspaces layout under `packages/`.
- Additional packages may be added later.
- Root `package.json` holds workspace config, shared scripts, and shared dev tooling where appropriate.
- Each package keeps its own `package.json`, build outputs, and tests.
- Preserve published package name `rotating-file-stream` and existing export paths (`dist/cjs`, `dist/esm`, `dist/types`) unless a major version bump explicitly changes them.

**Notes**

- Move package tsconfig / `.npmignore` templates live under `scripts/templates/`; `yarn build` copies them into each package and writes a package `.gitignore` for those generated files.
- Update `prepare`, ESLint paths, and TS project references for the monorepo.
- Avoid unrelated refactors while restructuring.

---

### 4. Tests: Vitest

**Current state**

- Vitest is installed at the monorepo root; `yarn test` / `yarn coverage` run Vitest for `packages/*/test/unit/**/*.test.ts` and `packages/*/test/integration/**/*.test.ts`.
- Coverage produces `coverage/lcov.info` (and HTML under `coverage/`).
- Scripts: `yarn test`, `yarn coverage` (`vitest run` / `vitest run --coverage`).

**Target**

- Keep Vitest as the only test runner for the published package.
- Keep Vitest’s **default parallelism**: test **files** may run in parallel across workers; tests **within** a file stay sequential. Do not force global serial execution (`fileParallelism: false`, single-thread pools, or a custom sequencer) unless there is an explicit, temporary reason.
- Do **not** port the reference-test ordering / `99clean.test.ts` sequencer pattern. Isolation and cleanup belong in Vitest **setup / teardown** (`beforeEach` / `afterEach`, `beforeAll` / `afterAll`, file-level hooks, fixtures) so each file can run safely in parallel.
- Coverage must still produce `lcov.info` for Codecov.
- Keep `TZ=Europe/Rome` for interval/rotation tests.
- Type tests (`*.test-d.ts`) run with `yarn test` / `yarn coverage` via Vitest `typecheck`.

**Notes**

- Root `test/` used ordered files and a late cleanup suite because those tests shared mutable filesystem state; that approach is obsolete for the package suite.
- Port assertions and scenarios from root `test/` (see **Integration test migration (`test/02`-`09`)**); replace custom mocks with Vitest mocking APIs (see **Vitest mocks** above); replace shared sequential cleanup with per-test or per-file setup/teardown.

---

### 5. Core library: rewrite `rotating-file-stream` internals

**Current state**

- Public API (reference): `RotatingFileStream` extends `stream.Writable`; factory `createStream()`.
- New package stub: `packages/rotating-file-stream/index.ts` with an empty `createStream`.
- Main write path in the reference implementation already uses `fs/promises` `FileHandle.write()` after `open()`.
- Gzip compression in the reference still pipes through `createReadStream` / `createWriteStream`.

**Target**

- Full internal rewrite: **do not use Node streams for internal file I/O** (including compression). `createReadStream` / `createWriteStream` / piping files are reference-only and must not be reproduced.
- File I/O must use `fs/promises` primitives that match C `stdio.h`: `open` (→ `FileHandle`), `FileHandle.write`, `FileHandle.close`. Use `FileHandle.read` only when a file must be read (compression, history). Do **not** use high-level helpers such as `readFile` / `writeFile` / `appendFile` for the log write path.
- The **public** API stays a `stream.Writable` (`createStream`, events, `end`, …); only internals drop streams.
- **Preserve the external `Writable` API** and documented behavior (events, options, rotation rules) so existing consumers do not break without a intentional major release.
- Maintain compatibility with existing tests; behavior must match current semantics unless a documented breaking change is agreed. Generator `index` (start value `0` vs `1`, omitting `0` from names) follows the README, not root `index.ts` / `test/*` (see **Generator `index`** above).

**Notes**

- Injectable `fsCreateReadStream` / `fsCreateWriteStream` on the class are for testing in the reference only; the rewrite must keep internals private and use the test-only widened type + `asTestStream` pattern (see **Production-like RotatingFileStream**).
- Keep `RotatingFileStreamError` and event names (`open`, `rotation`, `rotated`, `removed`, `history`, `external`, `warning`, …).
- Prefer incremental commits: new internal layer → port features → delete stream-based internals.

---

## Suggested order

Dependencies between workstreams:

```text
monorepo layout (3) ──► easier to change package internals (5)
Vitest (4) ──► before or in parallel with CI (1), required for Codecov path (2)
GitHub Actions (1) ──► Codecov upload (2)
core rewrite (5) ──► after or alongside Vitest; must stay green in CI
```

A practical sequence:

1. Monorepo skeleton (under `packages/rotating-file-stream`): in progress.
2. Port reference tests to Vitest under the package (same behavior, lcov output).
3. Codecov upload from GitHub Actions.
4. Internal rewrite of `rotating-file-stream` with tests as the contract.

---

## Principles for all changes

- **Explicit ask only**: implement exactly what the human requested; nothing more. The codebase is intentionally incomplete until this initiative ends; do not clean up unused exports, unfinished APIs, or unrelated broken/partial code.
- **Zero runtime dependencies**: `packages/rotating-file-stream` must never gain external runtime dependencies; Node built-ins only (see section above).
- **Vitest mocks**: new/porting tests under `packages/*/test/**` must use Vitest mocking APIs; do not carry over the custom mock style from root `test/` (see section above).
- **Vitest parallelism**: keep default file-parallel execution; isolate with setup/teardown, not sequential sequencers from the reference suite.
- **Production-like stream API**: keep `RotatingFileStream` internals private; tests widen types locally (`asTestStream` / `TestRotatingFileStream`), never public fields or `any` for convenience (see section above).
- **No internal streams**: published-library file I/O uses `fs/promises` `open` / `FileHandle.write` / `FileHandle.close` (C `stdio.h` style), not Node streams or `readFile`/`writeFile` on the log path (see workstream 5).
- **Behavior first**: rotation, compression, history, and error handling must match existing tests unless explicitly changing a major version. For code changes, read root `index.ts` / `test/*` as the reference contract; never edit those originals; never wire them into lint/test/build/CI. Exception: generator `index` follows the README, not the reference sources (see **Generator `index`** above).
- **Minimal scope**: one workstream per PR when possible; no drive-by formatting or unrelated cleanup.
- **Local toolchain**: yarn scripts, `.nvmrc`, project ESLint/TypeScript; never global tools.
- **Documentation**: update `README.md`, `CHANGELOG.md`, and badges when CI or install paths change (see **Dual README** above while both copies exist).

---

## Key paths (today)

| Area                     | Path                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| Library (reference only) | `index.ts`: do not edit; remove at end of initiative                   |
| Tests (reference only)   | `test/*`: do not edit; remove at end of initiative                     |
| Active package           | `packages/rotating-file-stream/`                                       |
| README                   | `README.md` (see **Dual README** for the temporary package copy)       |
| Utilities                | `utils.ts`                                                             |
| GitHub Actions           | `.github/workflows/build.yml`                                          |
| Codecov                  | `codecov.yml`                                                          |
| Vitest                   | `vitest.config.ts`                                                     |
| Node version             | `.nvmrc` local; CI `versions` job (`node` 22/24/26, `codecov_node` 26) |

Update this table as the monorepo layout lands.
