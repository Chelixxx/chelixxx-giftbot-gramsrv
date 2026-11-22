#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_DIR="$SCRIPT_DIR/client"
UPSTREAM_URL="https://github.com/iamxvbaba/gramsrv-tweb.git"
UPSTREAM_COMMIT="8e6cc00b576364aa43824a1b3670bdee185046a1"

echo "[VOLTRA] Preparing pinned Web client source..."
rm -rf "$CLIENT_DIR"
git init -q "$CLIENT_DIR"
git -C "$CLIENT_DIR" remote add origin "$UPSTREAM_URL"
git -C "$CLIENT_DIR" fetch --quiet --depth=1 origin "$UPSTREAM_COMMIT"
git -C "$CLIENT_DIR" checkout --quiet --detach FETCH_HEAD

echo "[VOLTRA] Applying VOLTRA patches..."
node "$SCRIPT_DIR/patch-voltra.mjs" "$CLIENT_DIR"

export VITE_TELESRV_DC_HOST="${VITE_TELESRV_DC_HOST:-voltra-server-production.up.railway.app}"
export VITE_TELESRV_DC_PORT="${VITE_TELESRV_DC_PORT:-443}"
export VITE_TELESRV_WS_PATH="${VITE_TELESRV_WS_PATH:-/apiws}"
export VOLTRA_WEB_HOST="${VOLTRA_WEB_HOST:-chelixxx-giftbot-gramsrv.pages.dev}"

cd "$CLIENT_DIR"
if ! command -v pnpm >/dev/null 2>&1; then
  npm install --global pnpm@9.15.3
fi

echo "[VOLTRA] Installing dependencies..."
pnpm install --frozen-lockfile

echo "[VOLTRA] Building production Web client..."
pnpm build

test -s dist/index.html

# The upstream Vite config intentionally disables publicDir copying because
# public/ also contains obsolete prebuilt JS chunks. Copy only live static assets.
mkdir -p dist/assets
if [ -d public/assets ]; then
  cp -a public/assets/. dist/assets/
fi
for asset in browserconfig.xml decoderWorker.min.js decoderWorker.min.wasm \
  encoderWorker.min.js encoderWorker.min.wasm recorder.min.js \
  rlottie-wasm.js rlottie-wasm.wasm site_apple.webmanifest \
  site.webmanifest version waveWorker.min.js; do
  if [ -f "public/$asset" ]; then
    cp -a "public/$asset" dist/
  fi
done

cp "$SCRIPT_DIR/_redirects" dist/_redirects
test -s dist/assets/fonts/Roboto-Medium.woff2

echo "[VOLTRA] Build ready: $CLIENT_DIR/dist"
