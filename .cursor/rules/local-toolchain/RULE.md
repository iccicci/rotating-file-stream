---
description: Use local Node, TypeScript, ESLint, and yarn for shell commands
alwaysApply: true
---

# Local toolchain for external commands

When running shell commands in this project, use the project's local toolchain, not globally installed tools.

## Node version (.nvmrc)

This project pins Node in `.nvmrc`. Before any `node`, `yarn`, `npm`, or tool that depends on Node:

1. Load nvm if needed: `export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"`
2. Activate the project version: `nvm use` (from the repo root, or pass the path: `nvm use /path/to/repo`)

Combine in one shell invocation when chaining commands:

```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use && yarn test
```

Do not assume the default shell `node` matches `.nvmrc`.

## Package manager

Use **yarn** (this repo has `yarn.lock`). Prefer `yarn <script>` over raw binaries.

| Task            | Command         |
| --------------- | --------------- |
| Lint            | `yarn eslint`   |
| Test            | `yarn test`     |
| Coverage        | `yarn coverage` |
| Lint + coverage | `yarn all`      |
| Build           | `yarn build`    |

## Local binaries only

Never invoke global `eslint`, `tsc`, `vitest`, `tsx`, or `prettier`. Use one of:

- **Preferred:** `yarn <script>` (see `package.json` scripts)
- **Direct:** `./node_modules/.bin/<tool>` or `yarn exec <tool>`

Examples:

```bash
# ✅ GOOD
yarn eslint
yarn test
yarn exec tsc -p packages/rotating-file-stream/tsconfig.cjs.json
# or: yarn build  (all packages)

# ❌ BAD
eslint index.ts
tsc -p tsconfig.json
vitest run
npx eslint index.ts   # avoid npx when yarn scripts exist
```

TypeScript and ESLint versions come from `devDependencies` in `package.json`; always run them through yarn or `node_modules/.bin`.
