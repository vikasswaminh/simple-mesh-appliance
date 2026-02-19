#!/usr/bin/env bash
set -euo pipefail

cd ""/usr/bin"

echo "Building Simple Mesh Link backend..."

# Download dependencies
go mod tidy

# Build for Linux amd64 (suitable for the production server)
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o meshlink-server .

echo "Build complete: ./meshlink-server"
echo ""
echo "Deploy steps:"
echo "  1. Copy meshlink-server to /opt/meshlink/"
echo "  2. Ensure /etc/wgctrl/config.env is set up"
echo "  3. Run: psql $DB_URL -f db/schema.sql  (first time only)"
echo "  4. Copy meshlink.service to /etc/systemd/system/"
echo "  5. systemctl daemon-reload && systemctl enable --now meshlink"
