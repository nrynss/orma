#!/usr/bin/env bash
# Package Orma into a checkout of CALLE-AI/awesome-phone-call-agents.
#
# Usage: scripts/package-list-pr.sh <list-repo-checkout>
#
# The copy comes from the committed HEAD, never the working tree. It lands in
# apps/web/orma/ and leaves out proxy/, dev-diary/, design/ and agent files.
# The script then scans the copy, runs the tests inside it, adds the index row,
# and runs the list repository's own validator. Any failure stops the run.

set -euo pipefail

target="${1:-}"
if [ -z "$target" ] || [ ! -f "$target/scripts/validate_repository.py" ] || [ ! -d "$target/apps" ]; then
  echo "usage: scripts/package-list-pr.sh <checkout of awesome-phone-call-agents>" >&2
  exit 2
fi

src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="$(cd "$target" && pwd)"
dest="$target/apps/web/orma"

fail() {
  echo "package-list-pr: $*" >&2
  exit 1
}

echo "package-list-pr: copying HEAD $(git -C "$src" rev-parse --short HEAD) into apps/web/orma"
rm -rf "$dest"
mkdir -p "$dest"
git -C "$src" archive --format=tar HEAD \
  web supabase scripts testdata docs .env.example README.md \
  | tar -x -C "$dest"
rm -f "$dest/scripts/package-list-pr.sh"

# The copy has no proxy Worker, so its README says what stands in for it.
python3 - "$dest/README.md" <<'PY'
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
note = """## About this copy

This directory packages Orma for the CALL-E awesome list. It includes the web app, the Supabase schema and functions, the local stack script and the recorded fixtures.

It leaves out the `proxy/` Worker. That Worker is a plain pass-through to the Supabase project. The web app and the functions refuse any API URL containing `supabase.co`, so a self-hosted deployment needs its own reverse proxy in front of the project. Point `ORMA_API_URL` at that proxy.

The local walkthrough below needs no proxy and places no calls.

"""
marker = "## What Orma is"
if marker not in text:
    sys.exit("README has no 'What Orma is' section to anchor the note")
open(path, "w", encoding="utf-8").write(text.replace(marker, note + marker, 1))
PY

echo "package-list-pr: scanning the copy"
secret_patterns='sb_secret_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,}|[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}|"private_key"[[:space:]]*:[[:space:]]*"-----BEGIN'
if hits="$(grep -rlIE "$secret_patterns" "$dest" 2>/dev/null)"; then
  fail "key-shaped text in: ${hits//$dest\//}"
fi
# A PEM header alone is code that parses keys. Key material follows the header.
if hits="$(grep -rlIPz -- '-----BEGIN [A-Z ]*PRIVATE KEY-----(\\n|\n)[A-Za-z0-9+/]{40,}' "$dest" 2>/dev/null)"; then
  fail "private key material in: ${hits//$dest\//}"
fi

found_env="$(find "$dest" -name '.env' -o -name '.env.*' ! -name '.env.example' | head -1)"
[ -z "$found_env" ] || fail "an env file was copied: ${found_env#$dest/}"

big="$(find "$dest" -type f -size +5M | head -1)"
[ -z "$big" ] || fail "file over 5 MB: ${big#$dest/}"

if [ -f "$src/.env" ]; then
  owner_digits="$(grep -E '^ORMA_OWNER_PHONE=' "$src/.env" | head -1 | cut -d= -f2- | tr -cd '0-9')"
  if [ "${#owner_digits}" -ge 10 ]; then
    if hits="$(grep -rlIF "${owner_digits: -10}" "$dest" 2>/dev/null)"; then
      fail "the operator's phone number appears in: ${hits//$dest\//}"
    fi
  fi
fi

operator_email="$(git -C "$src" config user.email || true)"
if [ -n "$operator_email" ] && hits="$(grep -rlIiF "$operator_email" "$dest" 2>/dev/null)"; then
  fail "the operator's email appears in: ${hits//$dest\//}"
fi

echo "package-list-pr: running Deno tests in the copy"
(
  cd "$dest"
  for suite in dispatch-mode finalise ingest poll calle receipt deliver-telegram; do
    files="supabase/functions/_shared/$suite.ts"
    [ -f "supabase/functions/_shared/${suite}_tests.ts" ] && files="$files supabase/functions/_shared/${suite}_tests.ts"
    # shellcheck disable=SC2086
    timeout 600 deno test --quiet --allow-read --allow-env --allow-net=127.0.0.1 $files >/dev/null \
      || fail "deno tests failed for $suite"
  done
  timeout 600 deno test --quiet --allow-read --allow-env supabase/functions/tick/index.ts >/dev/null \
    || fail "deno tests failed for tick"
)

echo "package-list-pr: running npm run check in the copy"
(
  cd "$dest/web"
  timeout 900 npm ci --no-audit --no-fund --loglevel=error >/dev/null || fail "npm ci failed"
  PUBLIC_ORMA_API_URL=http://127.0.0.1:54321 PUBLIC_SUPABASE_ANON_KEY=placeholder-publishable-key \
    timeout 900 npm run --silent check >/dev/null || fail "npm run check failed"
)
rm -rf "$dest/web/node_modules" "$dest/web/.svelte-kit"

index="$target/apps/README.md"
if ! grep -qF '[`web/orma`](web/orma/)' "$index"; then
  python3 - "$index" <<'PY'
import sys
path = sys.argv[1]
row = ("| [`web/orma`](web/orma/) | TypeScript / SvelteKit / Deno / Supabase | "
       "Daily two-minute accountability calls. SQL briefs CALL-E, so the call leads with what you keep "
       "not doing, captures new items, and lets you drop one without argument. Consent rows, a one-time "
       "code call before any number is dialled daily, cancel and pause, plus Telegram and MCP surfaces. "
       "Dry run by default, with a local Supabase stack and recorded fixtures. |")
lines = open(path, encoding="utf-8").read().split("\n")
for i, line in enumerate(lines):
    if line.strip() == "| --- | --- | --- |":
        lines.insert(i + 1, row)
        break
else:
    sys.exit("apps/README.md has no app table")
open(path, "w", encoding="utf-8").write("\n".join(lines))
PY
fi

echo "package-list-pr: running the list repository's validator"
(cd "$target" && timeout 600 python3 scripts/validate_repository.py >/dev/null) || fail "validate_repository.py failed"

files="$(find "$dest" -type f | wc -l)"
size="$(du -sh "$dest" | cut -f1)"
echo "package-list-pr: done. $files files, $size, in apps/web/orma"
