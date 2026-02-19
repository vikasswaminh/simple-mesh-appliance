#!/bin/bash
# =============================================================================
# Upload and run deployment on the DigitalOcean droplet
# Run this from your local machine
# =============================================================================
set -euo pipefail

DROPLET_IP=64.227.164.234
SSH_KEY=~/.ssh/id_rsa   # or your key path
SRC_DIR=$(dirname "$(realpath "$0")")/..

echo "==> Packaging source..."
cd "$SRC_DIR"
tar --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env.local'     -czf /tmp/wgctrl-src.tar.gz .

echo "==> Uploading to $DROPLET_IP..."
scp -i $SSH_KEY -o StrictHostKeyChecking=no     /tmp/wgctrl-src.tar.gz     root@$DROPLET_IP:/tmp/wgctrl-src.tar.gz

echo "==> Extracting and deploying on server..."
ssh -i $SSH_KEY -o StrictHostKeyChecking=no root@$DROPLET_IP << 'REMOTE'
    set -euo pipefail
    rm -rf /opt/wgctrl-src
    mkdir -p /opt/wgctrl-src
    tar -xzf /tmp/wgctrl-src.tar.gz -C /opt/wgctrl-src
    rm /tmp/wgctrl-src.tar.gz
    chmod +x /opt/wgctrl-src/deploy/deploy.sh
    bash /opt/wgctrl-src/deploy/deploy.sh
REMOTE

echo "==> Deployment complete!"
echo "    https://mesh.networkershome.com"
