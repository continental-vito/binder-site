#!/usr/bin/env bash
# The whole pipeline. Runs locally via `make ci` and in GitHub Actions; both
# call this file so the two can never disagree about what "green" means.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

echo "▸ syntax"
node --check api/contact.js || fail=1

echo "▸ tests"
node --test "tests/*.test.js" || fail=1

echo "▸ site checks"
node build/check-site.mjs || fail=1

# Needs Chrome: present on GitHub's ubuntu runners and on the Mac. Set
# SKIP_SMOKE=1 only on a machine without it — and say so when reporting.
if [ "${SKIP_SMOKE:-0}" = "1" ]; then
  echo "▸ browser smoke test SKIPPED (SKIP_SMOKE=1)"
else
  echo "▸ browser smoke test"
  node build/smoke.mjs || fail=1
fi

if [ "$fail" -ne 0 ]; then echo "✗ ci failed"; exit 1; fi
echo "✓ ci passed"
