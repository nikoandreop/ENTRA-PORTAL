#!/usr/bin/env bash
set -euo pipefail

#############################################################################
# Entra Portal - Auto-Update Setup
#
# Works with both Docker and native deployments. Detects which one
# you're using automatically.
#
# Usage: sudo ./scripts/setup-auto-update.sh
#############################################################################

INSTALL_DIR="${ENTRA_PORTAL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${ENTRA_PORTAL_BRANCH:-main}"
CHECK_INTERVAL="${ENTRA_PORTAL_UPDATE_INTERVAL:-5min}"
SERVICE_USER="${ENTRA_PORTAL_USER:-root}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[ENTRA]${NC} $1"; }

# Detect deployment mode
if systemctl is-active --quiet entra-portal-api 2>/dev/null; then
  DEPLOY_MODE="native"
elif command -v docker &>/dev/null && docker compose -f "${INSTALL_DIR}/docker/docker-compose.yml" ps --quiet 2>/dev/null | head -1 | grep -q .; then
  DEPLOY_MODE="docker"
else
  DEPLOY_MODE="native"
fi

log "Detected deployment mode: ${DEPLOY_MODE}"

cat > /usr/local/bin/entra-portal-update << SCRIPT
#!/usr/bin/env bash
set -euo pipefail

cd "${INSTALL_DIR}"
CURRENT=\$(git rev-parse HEAD)
git fetch origin "${BRANCH}" --quiet

REMOTE=\$(git rev-parse "origin/${BRANCH}")

if [ "\$CURRENT" = "\$REMOTE" ]; then
  exit 0
fi

echo "[ENTRA] New version detected: \${REMOTE:0:8}. Updating..."
git reset --hard "origin/${BRANCH}"

if [ "${DEPLOY_MODE}" = "docker" ]; then
  DOCKER_BUILDKIT=0 docker compose -f docker/docker-compose.yml build --quiet
  docker compose -f docker/docker-compose.yml up -d
  docker image prune -f --filter "until=24h" > /dev/null 2>&1 || true
else
  npm ci --ignore-scripts 2>/dev/null || npm install --ignore-scripts
  npm run build --workspace=src/shared
  npm run build --workspace=src/api
  npm run build --workspace=frontend
  cp -r frontend/dist/* /var/www/entra-portal/
  systemctl restart entra-portal-api
fi

sleep 10
if curl -sf http://localhost:3001/api/health > /dev/null; then
  echo "[ENTRA] Update successful: \${REMOTE:0:8}"
else
  echo "[ENTRA] WARNING: API health check failed after update"
fi
SCRIPT

chmod +x /usr/local/bin/entra-portal-update

cat > /etc/systemd/system/entra-portal-update.service << SERVICE
[Unit]
Description=Entra Portal Auto-Update
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=${SERVICE_USER}
ExecStart=/usr/local/bin/entra-portal-update
StandardOutput=journal
StandardError=journal
SERVICE

cat > /etc/systemd/system/entra-portal-update.timer << TIMER
[Unit]
Description=Check for Entra Portal updates

[Timer]
OnBootSec=1min
OnUnitActiveSec=${CHECK_INTERVAL}
RandomizedDelaySec=30s

[Install]
WantedBy=timers.target
TIMER

systemctl daemon-reload
systemctl enable --now entra-portal-update.timer

log "Auto-update configured!"
echo ""
echo -e "  Mode:     ${YELLOW}${DEPLOY_MODE}${NC}"
echo -e "  Interval: ${YELLOW}${CHECK_INTERVAL}${NC}"
echo -e "  Branch:   ${YELLOW}${BRANCH}${NC}"
echo ""
echo "  Commands:"
echo "    systemctl status entra-portal-update.timer   # Timer status"
echo "    journalctl -u entra-portal-update -f         # Update logs"
echo "    sudo entra-portal-update                     # Manual update now"
