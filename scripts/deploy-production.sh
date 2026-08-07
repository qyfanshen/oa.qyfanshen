#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="${PM2_APP_NAME:-oa}"

cd "$APP_DIR"

command -v npm >/dev/null || { echo "[ERROR] npm is not available." >&2; exit 1; }
command -v pm2 >/dev/null || { echo "[ERROR] pm2 is not available." >&2; exit 1; }

if [[ ! -s .env.local ]]; then
  echo "[ERROR] Missing .env.local. Deployment aborted." >&2
  exit 1
fi

on_error() {
  echo "[ERROR] Deployment failed. OA remains stopped to prevent a PM2 restart loop." >&2
  pm2 stop "$APP_NAME" >/dev/null 2>&1 || true
}
trap on_error ERR

echo "[1/5] Stopping OA"
pm2 stop "$APP_NAME" >/dev/null 2>&1 || true

echo "[2/5] Installing locked dependencies"
# Next.js/Tailwind need platform-specific native packages shipped as optional dependencies.
npm ci --include=dev

echo "[3/5] Creating the production build"
rm -rf .next
nice -n 10 env NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1536}" npm run build
test -s .next/BUILD_ID

echo "[4/5] Starting OA with bounded restart protection"
chmod +x start.sh scripts/deploy-production.sh
# startOrReload preserves parts of a legacy PM2 entry. Recreate entries that
# were originally registered against npm so the configured start.sh is used.
CURRENT_SCRIPT="$(pm2 jlist 2>/dev/null | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  try {
    const apps = JSON.parse(input);
    const app = apps.find(item => item.name === process.argv[1]);
    process.stdout.write(app?.pm2_env?.pm_exec_path || "");
  } catch {}
});
' "$APP_NAME")"
EXPECTED_SCRIPT="$APP_DIR/start.sh"
if [[ -n "$CURRENT_SCRIPT" && "$CURRENT_SCRIPT" != "$EXPECTED_SCRIPT" ]]; then
  echo "[INFO] Replacing legacy PM2 entry: $CURRENT_SCRIPT"
  pm2 delete "$APP_NAME"
fi
pm2 startOrReload ecosystem.config.cjs --only "$APP_NAME" --update-env

echo "[5/5] Verifying OA"
for attempt in {1..30}; do
  if curl --fail --silent --head http://127.0.0.1:3000/ >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "[ERROR] OA did not become healthy within 30 seconds." >&2
    pm2 logs "$APP_NAME" --lines 50 --nostream >&2 || true
    exit 1
  fi
  sleep 1
done
pm2 save

trap - ERR
echo "[OK] OA production deployment completed."
