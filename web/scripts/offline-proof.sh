#!/usr/bin/env bash
# Real-model offline proof in Windows Edge:
# build -> 2 online runs (cache model, WASM, shell) -> swap in a 503-only
# server -> run again. Prints each run's SELFTEST line.
set -uo pipefail
cd "$(dirname "$0")/.."
stop_port() { for pid in $(lsof -t -i :4173 2>/dev/null || fuser 4173/tcp 2>/dev/null); do kill "$pid" 2>/dev/null; done; sleep 1; }
stop_port
VITE_MODEL_URL=/models/embeddinggemma-2-text-vision-440m.litertlm npm run build >/dev/null 2>&1 || { echo "build failed"; exit 1; }
npx vite preview --port 4173 --strictPort >/dev/null 2>&1 &
sleep 3
for i in 1 2; do
  echo "== online run $i"
  BASE_URL=http://localhost:4173 scripts/edge-run.sh "/?debug=1&autotest=1#/" "SELFTEST_(PASS|FAIL)" 300 | cut -c26-
done
stop_port
node scripts/dead-server.mjs 4173 > dead.log 2>&1 &
sleep 1
echo "== offline run (server answers 503 to everything)"
BASE_URL=http://localhost:4173 scripts/edge-run.sh "/?debug=1&autotest=1#/" "SELFTEST_(PASS|FAIL)" 300 | cut -c26-
echo "== requests the dead server saw:"
cat dead.log
stop_port
rm -f dead.log
