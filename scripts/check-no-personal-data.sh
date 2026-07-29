#!/usr/bin/env bash
#
# Fails if anything tracked by git looks like personal data.
#
# This repo is public and contains no secrets by design, so the realistic
# accident is not a leaked key — it is someone committing their resume, their
# Drive IDs, or a recruiter's email address. This catches the common shapes.
#
# Run locally with:  npm run check:privacy
# Also runs in CI on every push and pull request.

set -uo pipefail

fail=0

report() {
  fail=1
  printf '\n\033[31m✗ %s\033[0m\n' "$1"
  shift
  printf '  %s\n' "$@"
}

# ---------------------------------------------------------------------------
# 1. Document and binary types that carry personal data
# ---------------------------------------------------------------------------
docs=$(git ls-files -- '*.pdf' '*.xlsx' '*.xls' '*.doc' '*.docx' '*.pages' '*.numbers' '*.key')
if [ -n "$docs" ]; then
  report "Tracked document files — resumes and exported trackers must not be committed:" $docs
fi

# ---------------------------------------------------------------------------
# 2. Email addresses outside the reserved example domains
#    RFC 2606 reserves example.com/net/org exactly for documentation.
# ---------------------------------------------------------------------------
emails=$(git grep -InoE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' -- . \
  | grep -viE '@example\.(com|net|org)' \
  | grep -viE '@users\.noreply\.github\.com' \
  | grep -viE '@[A-Za-z0-9.-]*\.example$' || true)
if [ -n "$emails" ]; then
  report "Real-looking email addresses — use example.com in docs and samples:" $emails
fi

# ---------------------------------------------------------------------------
# 3. Google Drive / Sheets / Docs IDs
#    Real ones are 28+ opaque characters mixing upper, lower, and digits. That
#    triple requirement is what keeps markdown anchors (all lowercase) and long
#    camelCase identifiers (no digits) out of the results.
#    The placeholders below are deliberate and documented.
# ---------------------------------------------------------------------------
allowed_ids='1AbCdEfGhIjKlMnOpQrStUvWxYz012345|PASTE_YOUR_SCRIPT_ID_HERE|EXAMPLE_[A-Z_0-9]+'
ids=$(git grep -InoE '[A-Za-z0-9_-]{28,}' -- . ':!package-lock.json' \
  | awk -F: '{ tok = $3 } tok ~ /[A-Z]/ && tok ~ /[a-z]/ && tok ~ /[0-9]/ { print }' \
  | grep -vE "$allowed_ids" \
  | grep -viE 'placeholder|<<[A-Z_]+>>' || true)
if [ -n "$ids" ]; then
  report "Strings that look like Google Drive/Sheets IDs — these belong in your Config tab, not in source:" $ids
fi

# ---------------------------------------------------------------------------
# 4. Files that should never be tracked at all
# ---------------------------------------------------------------------------
local_only=$(git ls-files -- '.clasp.json' '**/.clasp.json' '.env' '**/.env')
if [ -n "$local_only" ]; then
  report "Local-only files are tracked:" $local_only
fi

if [ "$fail" -eq 0 ]; then
  printf '\033[32m✓ No personal data found in tracked files.\033[0m\n'
  exit 0
fi

printf '\nSee SECURITY.md for what must never be committed.\n'
printf 'If a match is a false positive, add it to the allowlist in %s.\n' "$0"
exit 1
