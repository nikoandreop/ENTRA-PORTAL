#!/usr/bin/env bash
set -euo pipefail

#############################################################################
# Entra Portal - Auto-Update Setup
#
# Sets up a systemd timer that checks GitHub for new commits every 5 minutes
# and automatically rebuilds/restarts if changes are detected.
#
# Usage: ./scripts/setup-auto-update.sh
#############################################################################

INSTALL_DIR="${ENTRA_PORTAL_DIR:-$(pwd)}"
BRANCH="${ENTRA_PORTAL_BRANCH:-main}"
CHECK_INTERVAL="${ENTRA_PORTAL_UPDATE_INTERVAL:-5min}"
SERVICE_USER="${ENTRA_PORTAL_USER:-$(whoami)}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[ENTRA]${NC} $1"; }

# Create the update script
log "Creating update script..."
sudo tee /usr/local/bin/entra-portal-update > /dev/null << SCRIPT
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

docker compose -f docker/docker-compose.yml build --quiet
docker compose -f docker/docker-compose.yml up -d

# Wait and verify
sleep 10
if curl -sf http://localhost:3001/api/health > /dev/null; then
  echo "[ENTRA] Update successful: \${REMOTE:0:8}"
else
  echo "[ENTRA] WARNING: API health check failed after update"
fi

# Prune old images
docker image prune -f --filter "until=24h" > /dev/null 2>&1 || true
SCRIPT

sudo chmod +x /usr/local/bin/entra-portal-update

# Create systemd service
log "Creating systemd service..."
sudo tee /etc/systemd/system/entra-portal-update.service > /dev/null << SERVICE
[Unit]
Description=Entra Portal Auto-Update
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
User=${SERVICE_USER}
ExecStart=/usr/local/bin/entra-portal-update
StandardOutput=journal
StandardError=journal
SERVICE

# Create systemd timer
log "Creating systemd timer (every ${CHECK_INTERVAL})..."
sudo tee /etc/systemd/system/entra-portal-update.timer > /dev/null << TIMER
[Unit]
Description=Check for Entra Portal updates

[Timer]
OnBootSec=1min
OnUnitActiveSec=${CHECK_INTERVAL}
RandomizedDelaySec=30s

[Install]
WantedBy=timers.target
TIMER

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable --now entra-portal-update.timer

log "Auto-update configured!"
echo ""
echo -e "  Check interval: ${YELLOW}${CHECK_INTERVAL}${NC}"
echo -e "  Branch:         ${YELLOW}${BRANCH}${NC}"
echo ""
echo "  Useful commands:"
echo "    systemctl status entra-portal-update.timer   # Timer status"
echo "    journalctl -u entra-portal-update -f         # Update logs"
echo "    sudo entra-portal-update                     # Manual update"
echo "    systemctl stop entra-portal-update.timer      # Disable auto-update"
