#!/usr/bin/env bash
# Open a dev-server page in headless *Windows* Edge (real GPU via WSL interop),
# wait for a marker line in report.log (pages POST lines to /__report), print it.
# Usage: scripts/edge-run.sh "/spike.html?report=1" [MARKER_REGEX] [TIMEOUT_S]
# Needs: `npm run dev` (or BASE_URL=http://localhost:4173 with `vite preview`); WSL2 localhost forwarding.
set -euo pipefail
cd "$(dirname "$0")/.."
URL_PATH="$1"; MARKER="${2:-_(DONE|ERROR)}"; TIMEOUT="${3:-600}"
EDGE="/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
WT=$(cmd.exe /c "echo %TEMP%" 2>/dev/null | tr -d '\r')
PROFILE="$WT\\doppel-edge"
: > report.log
"$EDGE" --headless=new --user-data-dir="$PROFILE" --enable-unsafe-webgpu --no-first-run \
  --disable-extensions "${BASE_URL:-http://localhost:5173}${URL_PATH}" >/dev/null 2>&1 &
for ((i = 0; i < TIMEOUT; i += 2)); do grep -q -E "$MARKER" report.log && break; sleep 2; done
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { \$_.CommandLine -like '*doppel-edge*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1 || true
cat report.log
grep -q -E "$MARKER" report.log || { echo "TIMEOUT waiting for $MARKER" >&2; exit 1; }
