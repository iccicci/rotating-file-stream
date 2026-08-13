#!/usr/bin/env bash
# Verify rotating-file-stream dist is consumable via require, import, and TypeScript NodeNext resolution.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

run_flavor() {
  local flavor="$1"
  local dir="$ROOT/test/$flavor"

  echo "==> $flavor: yarn install"
  (cd "$dir" && yarn install)

  case "$flavor" in
    cjs|esm)
      echo "==> $flavor: node index.js"
      (cd "$dir" && node ./index.js)
      ;;
    types)
      echo "==> $flavor: tsc --noEmit"
      (cd "$dir" && "$ROOT/node_modules/.bin/tsc" -p ./tsconfig.json)
      echo "types ok"
      ;;
    *)
      echo "error: unknown flavor $flavor" >&2
      exit 1
      ;;
  esac
}

run_flavor cjs
run_flavor esm
run_flavor types

echo "==> all build consumption checks passed"
