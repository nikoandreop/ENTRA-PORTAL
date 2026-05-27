#!/usr/bin/env bash
set -euo pipefail

echo "=== Entra Portal Development Setup ==="
echo ""

# Check prerequisites
for cmd in node npm docker; do
  if ! command -v "${cmd}" &>/dev/null; then
    echo "Error: ${cmd} is required but not installed."
    exit 1
  fi
done

echo "Prerequisites OK"

# Create .env from template if not exists
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from template - EDIT THIS FILE with your settings"
fi

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Generate development certificates
echo ""
echo "Generating development certificates..."
./scripts/generate-certs.sh ./certs

# Create data directory
mkdir -p data

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Start development:"
echo "  Terminal 1: npm run dev:api"
echo "  Terminal 2: npm run dev:frontend"
echo ""
echo "Or use Docker:"
echo "  docker compose -f docker/docker-compose.yml up -d"
echo ""
echo "Default login:"
echo "  Email:    admin@entra-portal.local"
echo "  Password: EntraPortal!2024"
echo ""
echo "IMPORTANT: Change the default password and secrets before production use!"
