#!/usr/bin/env bash
set -euo pipefail

# Run on a machine/runner with Node >=22 and access to registry.npmjs.org.
# Generates package.json and package-lock.json together using npm.
# Intended only for feature/native-ios; it never commits or pushes.
EXPECTED_BRANCH="feature/native-ios"
CAPACITOR_VERSION="8.6.0"

cd "$(dirname "$0")/.."
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo "Refusing to change dependencies on branch: $CURRENT_BRANCH (expected $EXPECTED_BRANCH)" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to run: working tree is not clean." >&2
  exit 1
fi

npm install --save-exact "@capacitor/core@${CAPACITOR_VERSION}" "@capacitor/ios@${CAPACITOR_VERSION}"
npm install --save-dev --save-exact "@capacitor/cli@${CAPACITOR_VERSION}"
npm ci --no-audit --no-fund
npm test
npm run build
npm run build:native

echo "Capacitor dependencies and lockfile generated. Review package.json and package-lock.json before committing."
