#!/usr/bin/env bash
# Publish workspace packages to npm in dependency order (dependents last).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TSX="$ROOT/node_modules/.bin/tsx"

if [[ ! -x "$TSX" && ! -f "$TSX" ]]; then
  echo "error: tsx not found at $TSX (run yarn install)" >&2
  exit 1
fi

mapfile -t packages < <("$TSX" "$ROOT/scripts/packages-order.ts")

if [[ ${#packages[@]} -eq 0 ]]; then
  echo "error: no packages found under packages/" >&2
  exit 1
fi

for pkg_dir in "${packages[@]}"; do
  pkg_name="$(basename "$pkg_dir")"
  echo "==> publish $pkg_name"
  (cd "$pkg_dir" && npm publish --registry=https://registry.npmjs.org/)
done

echo "==> deploy done"
