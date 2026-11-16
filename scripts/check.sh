#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js is required for syntax checks (Node.js 24 recommended).' >&2
  exit 1
fi

for file in web/js/*.js; do
  node --check --input-type=module < "$file"
done

echo 'All JavaScript modules passed syntax checks.'
