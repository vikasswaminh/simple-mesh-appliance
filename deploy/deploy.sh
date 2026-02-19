#!/bin/bash
# =============================================================================
# WG_CLOUD_CTRL - Production Deployment Script
# Target: Ubuntu 24.04 LTS, DigitalOcean Bangalore
# Domain: mesh.networkershome.com
# =============================================================================
set -euo pipefail

APP_USER=wgctrl
APP_DIR=/opt/wgctrl
CONFIG_DIR=/etc/wgctrl
LOG_DIR=/var/log/wgctrl
DB_NAME=wgctrl
DB_USER=wgctrl
DOMAIN=mesh.networkershome.com
GO_VERSION=1.22.5
BINARY=meshlink-server
SRC_DIR=/opt/wgctrl-src

echo "==> [1/10] System update"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl wget git build-essential postgresql nginx certbot python3-certbot-nginx ufw fail2ban logrotate

echo "==> [2/10] Create app user"
id -u $APP_USER &>/dev/null || useradd -r -s /bin/false -d $APP_DIR $APP_USER

echo "==> [3/10] Install Go $GO_VERSION"
if ! /usr/local/go/bin/go version 2>/dev/null | grep -q "$GO_VERSION"; then
    wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" -O /tmp/go.tar.gz
    rm -rf /usr/local/go
    tar -C /usr/local -xzf /tmp/go.tar.gz
    rm /tmp/go.tar.gz
fi
export PATH=$PATH:/usr/local/go/bin

echo "==> [4/10] PostgreSQL setup"
systemctl enable --now postgresql

mkdir -p $CONFIG_DIR
chmod 750 $CONFIG_DIR

if [ ! -f $CONFIG_DIR/db_password ]; then
    openssl rand -hex 32 > $CONFIG_DIR/db_password
    chmod 600 $CONFIG_DIR/db_password
fi
if [ ! -f $CONFIG_DIR/jwt_secret ]; then
    openssl rand -hex 32 > $CONFIG_DIR/jwt_secret
    chmod 600 $CONFIG_DIR/jwt_secret
fi

DB_PASS=$(cat $CONFIG_DIR/db_password)
JWT_SECRET=$(cat $CONFIG_DIR/jwt_secret)

sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename='$DB_USER'" | grep -q 1 ||     sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS'"
sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS'"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 ||     sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"

echo "==> [5/10] Build Go backend"
mkdir -p $APP_DIR
cd $SRC_DIR/backend
export GOPATH=/root/go
/usr/local/go/bin/go mod download
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 /usr/local/go/bin/go build     -ldflags="-s -w" -trimpath     -o $APP_DIR/$BINARY .
chmod +x $APP_DIR/$BINARY

echo "==> [6/10] Build frontend"
cd $SRC_DIR
npm ci --prefer-offline
VITE_API_URL="" npm run build
mkdir -p $APP_DIR/public
cp -r dist/* $APP_DIR/public/

echo "==> [7/10] Write config"
cat > $CONFIG_DIR/config.env << CFGEOF
DB_URL=postgres://$DB_USER:$DB_PASS@127.0.0.1/$DB_NAME?sslmode=disable
JWT_SECRET=$JWT_SECRET
PORT=8081
APP_URL=https://$DOMAIN
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_FROM=noreply@networkershome.com
CFGEOF
chmod 640 $CONFIG_DIR/config.env
chown root:$APP_USER $CONFIG_DIR/config.env

echo "==> [8/10] systemd service"
cat > /etc/systemd/system/wgctrl.service << SVCEOF
[Unit]
Description=WG Cloud Ctrl API Server
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$CONFIG_DIR/config.env
ExecStart=$APP_DIR/$BINARY
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/app.log
StandardError=append:$LOG_DIR/app.log
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ReadWritePaths=$LOG_DIR

[Install]
WantedBy=multi-user.target
SVCEOF

mkdir -p $LOG_DIR
chown $APP_USER:$APP_USER $LOG_DIR
systemctl daemon-reload
systemctl enable wgctrl
systemctl restart wgctrl
sleep 2
systemctl is-active wgctrl || { journalctl -u wgctrl -n 20; exit 1; }

echo "==> [9/10] Nginx"
cat > /etc/nginx/sites-available/wgctrl << NGXEOF
server {
    listen 80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    location /api/sse/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        client_max_body_size 1m;
    }
    location /healthz {
        proxy_pass http://127.0.0.1:8081;
    }
    root $APP_DIR/public;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
    location ~* \.(js|css|png|svg|ico|woff2?)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
NGXEOF

ln -sf /etc/nginx/sites-available/wgctrl /etc/nginx/sites-enabled/wgctrl
rm -f /etc/nginx/sites-enabled/default
nginx -t

echo "==> [10/10] SSL Certificate"
if [ ! -d /etc/letsencrypt/live/$DOMAIN ]; then
    # Temporarily serve on 80 for cert
    systemctl reload nginx
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos         --email admin@networkershome.com --redirect
else
    systemctl reload nginx
fi

echo "==> Firewall"
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban"
systemctl enable --now fail2ban

echo "==> Log rotation"
cat > /etc/logrotate.d/wgctrl << LREOF
$LOG_DIR/*.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
    postrotate
        systemctl kill -s HUP wgctrl || true
    endscript
}
LREOF

echo "==> Daily DB backup cron"
mkdir -p /var/backups/wgctrl
cat > /etc/cron.d/wgctrl-backup << CEOF
0 2 * * * postgres pg_dump $DB_NAME | gzip > /var/backups/wgctrl/db-\$(date +\%Y\%m\%d).sql.gz && find /var/backups/wgctrl -name '*.sql.gz' -mtime +30 -delete
CEOF

echo ""
echo "====================================="
echo "  Deployed: https://$DOMAIN"
echo "  Health:   https://$DOMAIN/healthz"
echo "====================================="
