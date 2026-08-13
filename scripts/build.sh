#!/usr/bin/env bash
# cSpell:ignore nullglob
# Copy package tsconfig/.npmignore templates and emit dist/cjs, dist/esm, dist/types for each package.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TEMPLATES_DIR="$ROOT/scripts/templates"
TSC="$ROOT/node_modules/.bin/tsc"
PROJECTS=(tsconfig.cjs.json tsconfig.esm.json tsconfig.types.json)

if [[ ! -x "$TSC" && ! -f "$TSC" ]]; then
  echo "error: typescript not found at $TSC (run yarn install)" >&2
  exit 1
fi

shopt -s nullglob
packages=("$ROOT"/packages/*/)
shopt -u nullglob

if [[ ${#packages[@]} -eq 0 ]]; then
  echo "error: no packages found under packages/" >&2
  exit 1
fi

for pkg_dir in "${packages[@]}"; do
  pkg_dir="${pkg_dir%/}"

  if [[ ! -f "$pkg_dir/package.json" ]]; then
    continue
  fi

  pkg_name="$(basename "$pkg_dir")"
  echo "==> build $pkg_name"

  for template in "$TEMPLATES_DIR"/* "$TEMPLATES_DIR"/.[!.]*; do
    [[ -e "$template" ]] || continue
    [[ -f "$template" ]] || continue
    cp "$template" "$pkg_dir/$(basename "$template")"
  done

  for project in "${PROJECTS[@]}"; do
    "$TSC" -p "$pkg_dir/$project"
  done

  printf '%s\n' '{"type":"commonjs"}' > "$pkg_dir/dist/cjs/package.json"
done

echo "==> build done"
