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

# The actual public Layero hostname must be known to the client before
# patch-voltra.mjs rewrites the upstream brand and accepted host list.
export VOLTRA_WEB_HOST="${VOLTRA_WEB_HOST:-voltra-main.layero.app}"

echo "[VOLTRA] Applying VOLTRA patches..."
node "$SCRIPT_DIR/patch-voltra.mjs" "$CLIENT_DIR"

export VITE_TELESRV_DC_HOST="${VITE_TELESRV_DC_HOST:-voltra-server-production.up.railway.app}"
export VITE_TELESRV_DC_PORT="${VITE_TELESRV_DC_PORT:-443}"
export VITE_TELESRV_WS_PATH="${VITE_TELESRV_WS_PATH:-/apiws}"

cd "$CLIENT_DIR"
if ! command -v pnpm >/dev/null 2>&1; then
  npm install --global pnpm@9.15.3
fi

echo "[VOLTRA] Installing dependencies without optional native build scripts..."
pnpm install --frozen-lockfile --ignore-scripts

echo "[VOLTRA] Preparing the two required esbuild binaries..."
esbuild_installers=(node_modules/.pnpm/esbuild@*/node_modules/esbuild/install.js)
if [ ! -f "${esbuild_installers[0]}" ]; then
  echo "[VOLTRA] ERROR: esbuild install scripts were not found."
  exit 1
fi
for install_script in "${esbuild_installers[@]}"; do
  node "$install_script"
done

# TWEB_PREVIEW disables the upstream Vite checker plugin (TypeScript + ESLint).
# Those checks spawn additional workers and can exceed Layero build-container memory.
# Keep production bundling enabled; run static checks separately in CI.
export TWEB_PREVIEW=1

echo "[VOLTRA] Building production Web client (memory-safe mode; checker disabled)..."
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
