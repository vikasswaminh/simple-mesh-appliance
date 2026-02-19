# AGENT HANDOFF — Simple Mesh Link (WG Cloud Ctrl)
## READ THIS FIRST before touching any code

> **This document is the single source of truth for the next developer or AI agent picking up this project.**
> Written: February 2026. Last deployed commit: `2976653` (main branch on GitHub).

---

## 0. QUICK ORIENTATION (30-second read)

This is a **self-hosted WireGuard VPN mesh manager** — think "open-source Tailscale you run yourself."

- **Live URL:** https://mesh.networkershome.com
- **GitHub:** https://github.com/vikasswaminh/simple-mesh-appliance
- **Local source:** `C:\Users\test\Desktop\simple mesh link\simple-mesh-link\`
- **Tech:** React 18 (TypeScript/Vite) frontend + Go 1.22 REST API + PostgreSQL 16

---

## 1. INFRASTRUCTURE ACCESS

### Production Server

| Item | Value |
|---|---|
| **Provider** | DigitalOcean |
| **Droplet name** | `mesh-wgctrl` |
| **Public IP** | `64.227.164.234` |
| **Region** | Bangalore (blr1) |
| **Size** | s-1vcpu-2gb ($12/month) |
| **OS** | Ubuntu 24.04 LTS |
| **Domain** | mesh.networkershome.com (Cloudflare proxied) |

### SSH Access

```bash
# From Windows (use Python subprocess for reliability):
ssh -i C:/Users/test/.ssh/id_ed25519 -o StrictHostKeyChecking=no root@64.227.164.234

# SSH key location: C:\Users\test\.ssh\id_ed25519
# This key is registered as "ultraslim-local-key" in DigitalOcean account
# DO account: vikas@networkershome.com (vikasswaminh on GitHub)
```

**IMPORTANT on Windows:** Raw `ssh` in bash sometimes fails silently. Use Python subprocess:
```python
import subprocess
result = subprocess.run(
    ['C:/Windows/System32/OpenSSH/ssh.exe', '-o', 'StrictHostKeyChecking=no',
     '-i', 'C:/Users/test/.ssh/id_ed25519', 'root@64.227.164.234', 'your command here'],
    capture_output=True, timeout=60
)
print(result.stdout.decode('utf-8', errors='replace'))
```

### SCP Files to Server (Windows)
```powershell
# Always use Start-Process for SCP on Windows:
Start-Process -FilePath 'C:\Windows\System32\OpenSSH\scp.exe' `
  -ArgumentList '-o','StrictHostKeyChecking=no','-i','C:\Users\test\.ssh\id_ed25519',`
  'C:\local\file.sh','root@64.227.164.234:/tmp/file.sh' `
  -Wait -NoNewWindow

# CRITICAL: Shell scripts must use LF line endings (NOT CRLF) or bash will fail.
# Convert before upload:
with open('file.sh', 'rb') as f: content = f.read().replace(b'\r\n', b'\n')
with open('file-lf.sh', 'wb') as f: f.write(content)
```

### Server File Locations

| Path | Contents |
|---|---|
| `/opt/wgctrl/meshlink-server` | Go binary (the API server) |
| `/opt/wgctrl/public/` | Built React frontend (static files) |
| `/opt/wgctrl-src/` | Source code (cloned/extracted on server) |
| `/etc/wgctrl/config.env` | All environment variables (600 perms) |
| `/etc/wgctrl/db_password` | PostgreSQL password (600 perms) |
| `/etc/wgctrl/jwt_secret` | JWT signing secret (600 perms) |
| `/var/log/wgctrl/app.log` | Application logs |
| `/var/backups/wgctrl/` | Daily PostgreSQL backups (30-day retention) |

### Cloudflare

- DNS for `mesh.networkershome.com` → `64.227.164.234` (Proxied/orange cloud)
- CLI: `npx wrangler` (OAuth authenticated as vikas@networkershome.com)
- DigitalOcean CLI: `doctl` v1.146.0 (authenticated)

### Other Existing Droplets (DO NOT TOUCH)

| Droplet | IP | Purpose |
|---|---|---|
| ubuntu-s-1vcpu-2gb-blr1-01 | 139.59.18.0 | Existing project (untouchable) |
| ubuntu-s-1vcpu-1gb-blr1-01 | 165.22.223.28 | Existing project (untouchable) |
| ultraslim-relay | 139.59.93.230 | Relay server (untouchable but usable as relay) |

---

## 2. TEST CREDENTIALS (on live server)

These accounts exist in the production PostgreSQL database:

| Email | Password | Notes |
|---|---|---|
| `testadmin@mesh.local` | `SecurePass123` | Created during deployment testing |
| `prodtest@mesh.test` | `TestProd456` | Created during HTTPS verification |

**Clean these up** with:
```bash
sudo -u postgres psql wgctrl -c "DELETE FROM users WHERE email LIKE '%mesh.local' OR email LIKE '%mesh.test';"
```

To create a real admin, just sign up at https://mesh.networkershome.com.

---

## 3. ARCHITECTURE OVERVIEW

```
Browser (React SPA)
        |
        | HTTPS (TLS terminated at Nginx, Cloudflare proxied)
        |
   Nginx :443  (config: /etc/nginx/sites-available/wgctrl)
   ├── /api/sse/*   → proxy_pass http://127.0.0.1:8081  (unbuffered, 1hr timeout)
   ├── /api/*       → proxy_pass http://127.0.0.1:8081  (30s timeout)
   ├── /healthz     → proxy_pass http://127.0.0.1:8081
   └── /*           → static files /opt/wgctrl/public/  (SPA: try_files $uri /index.html)
        |
   Go API (meshlink-server) :8081
   ├── AuthHandler        JWT signup/signin/signout/reset
   ├── NetworksHandler    CRUD for WireGuard networks
   ├── PeersHandler       peer join/list/delete + IP allocation
   ├── MembersHandler     list/remove network members
   ├── InvitationsHandler email invitations
   ├── InviteLinksHandler shareable invite tokens
   ├── ActivityHandler    audit log reader
   ├── SSEHandler         Server-Sent Events subscriptions
   ├── middleware/Auth    JWT Bearer validation
   ├── middleware/CORS    allowed origins whitelist
   ├── middleware/RateLimit  10 req/s per IP, burst 20
   └── sse/Broker         in-memory pub/sub (no Redis, no external deps)
        |
   PostgreSQL :5432 (local unix socket, db: wgctrl, user: wgctrl)
```

### Key Design Decisions (do not break these)

1. **Private WireGuard keys NEVER reach the server.** Browser generates X25519 keypair via `crypto.subtle`. Only the public key is sent to `POST /api/peers/join`.
2. **No external dependencies.** No Supabase, Redis, message queue, or third-party auth. Everything runs on one machine.
3. **SSE not WebSocket.** Server-Sent Events used for real-time because it's simpler and works over HTTP/2. Frontend uses `fetch()` (not `EventSource`) to send Authorization header.
4. **DB schema is owned by migrations.go**, not schema.sql. `schema.sql` is reference only. Migrations run via `CREATE TABLE IF NOT EXISTS` — idempotent.
5. **JWT is stateless.** 24-hour expiry, HS256, no refresh tokens, no session table.

---

## 4. DATABASE SCHEMA (exact, as deployed)

```sql
-- All UUIDs use gen_random_uuid() (pgcrypto extension)

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE networks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- NOTE: "owner_id" not "user_id"
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE network_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',  -- 'owner' or 'member'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (network_id, user_id)
);

CREATE TABLE peers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- NOTE: peers DO have user_id
  public_key TEXT NOT NULL,
  endpoint   TEXT NOT NULL DEFAULT '',
  virtual_ip TEXT NOT NULL,  -- e.g. "10.10.0.2"
  last_seen  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (network_id, public_key),
  UNIQUE (network_id, virtual_ip)
);

CREATE TABLE invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id    UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  invited_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'accepted', 'declined'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invite_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  max_uses   INTEGER,    -- NULL = unlimited
  uses       INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,   -- NULL = never
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE network_activity_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id) ON DELETE SET NULL,  -- nullable
  event_type TEXT NOT NULL,   -- DB column name is "event_type"
  metadata   JSONB NOT NULL DEFAULT '{}',  -- DB column name is "metadata"
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### CRITICAL Schema Notes (caused bugs before — don't repeat them)

- `networks.owner_id` — NOT `user_id`. The column is named `owner_id`. All SQL in `networks.go` uses `owner_id`.
- `peers.user_id` — Peers DO have a `user_id` column (NOT NULL). Always include it in INSERT.
- `network_activity_logs` — DB columns are `event_type` and `metadata`. The Go struct maps them as json tags `event_type` and `metadata` but Go field names are `Action` and `Details`.
- `networks` has `updated_at` in DB but there is no auto-update trigger. The handler does NOT update it on PATCH (column exists, just not written).

---

## 5. ALL API ENDPOINTS

Base: `https://mesh.networkershome.com/api`

### Public (no auth)
```
GET  /healthz                → {"status":"ok"}
POST /api/auth/signup        → {user_id, token}        body: {email, password}
POST /api/auth/signin        → {user_id, email, token}  body: {email, password}
POST /api/auth/signout       → {message}
POST /api/auth/reset-password → {message}              body: {email}
```

### Protected (Authorization: Bearer <token>)
```
GET    /api/auth/me                      → {user_id, email}
POST   /api/auth/update-password         → {message}              body: {password}

POST   /api/networks/create              → {network_id}           body: {name?, description?}
GET    /api/networks                     → [{id,name,description,created_at}]
PATCH  /api/networks/:id                 → {message}              body: {name, description}
DELETE /api/networks/:id                 → {message}

POST   /api/peers/join                   → {virtual_ip, peers:[]}  body: {network_id, public_key, endpoint}
GET    /api/peers?network_id=X           → {peers:[]}
DELETE /api/peers/:id                    → {message}

GET    /api/networks/:id/members         → [{id,network_id,user_id,role,created_at,email}]
DELETE /api/members/:id                  → {message}

POST   /api/invitations                  → {invitation_id}        body: {network_id, invited_email}
GET    /api/invitations/pending          → [{id,network_id,...}]
POST   /api/invitations/accept           → {network_id} or {message}  body: {invitation_id, action:"accept"|"decline"}

POST   /api/invite-links                 → {id,token,...}          body: {network_id, max_uses?}
GET    /api/invite-links?network_id=X    → [{id,token,uses,...}]
DELETE /api/invite-links/:id             → {message}
POST   /api/invite-links/join            → {network_id}           body: {token}

GET    /api/activity?network_id=X&limit=50 → [{id,action,metadata,created_at}]

GET    /api/sse/peers?network_id=X       → SSE stream (text/event-stream)
GET    /api/sse/invitations              → SSE stream
GET    /api/sse/activity?network_id=X    → SSE stream
```

---

## 6. BACKEND CODE MAP

All backend code is in `backend/`. Go module: `github.com/wgcloudctrl/server`

```
backend/
├── main.go                  Router setup, middleware chain, graceful shutdown
├── go.mod                   Go 1.22, 4 deps: gorilla/mux, golang-jwt/jwt, lib/pq, golang.org/x/crypto
├── config/config.go         Loads env vars (DB_URL, JWT_SECRET, SMTP_*, APP_URL, PORT)
├── db/
│   ├── db.go                Opens pg pool (MaxOpen=25, MaxIdle=10, ConnMaxLife=5m)
│   └── migrations.go        CREATE TABLE IF NOT EXISTS — runs at startup, idempotent
├── middleware/
│   ├── auth.go              JWT Bearer validation → injects userID+email into context
│   ├── cors.go              Allowed origins: mesh.networkershome.com + localhost variants
│   └── ratelimit.go         Token bucket per IP (10 req/s, burst 20, cleanup every 5min)
├── sse/
│   └── broker.go            In-memory pub/sub. Topics: "peers:netID", "user:userID", "activity:netID"
└── handlers/
    ├── auth.go              Signup/Signin/Signout/ResetPassword/UpdatePassword/Me
    │                        Helpers: jsonOK(), jsonError(), makeJWT(), sendEmail()
    ├── networks.go          Create/List/Update/Delete networks
    ├── peers.go             Join/List/Delete peers + nextVirtualIP() + getPeers()
    ├── members.go           List/Delete network members
    ├── invitations.go       Create/Pending/Accept invitations
    ├── invite_links.go      Create/List/Delete/JoinByToken invite links
    ├── activity.go          List activity logs + logActivity() helper (used by all handlers)
    └── sse.go               Peers/Invitations/Activity SSE subscriptions
```

### Shared Helpers (defined in auth.go, used everywhere)

```go
jsonOK(w, statusCode, interface{})     // Write JSON response with status code
jsonError(w, message, statusCode)      // Write {"error": message} with status code
logActivity(db, networkID, userID, eventType, map[string]interface{})  // Write activity log
```

### SSE Broker Topics

```
"peers:{networkID}"    — published on peer join/leave
"user:{userID}"        — published on invitation received
"activity:{networkID}" — published on any activity event
```

---

## 7. FRONTEND CODE MAP

All frontend code in `src/`. Build tool: Vite 5. Import alias: `@` = `src/`.

```
src/
├── main.tsx                 React entry, wraps App with AuthProvider + QueryClientProvider
├── App.tsx                  Routes: / → Index, /auth → Auth, /reset-password → ResetPassword, /join/:token → JoinViaLink
├── lib/
│   ├── api.ts               ALL REST API calls. Uses localStorage("wgctrl_token") for JWT.
│   │                        API_BASE = VITE_API_URL env var (empty = same origin in production)
│   └── wireguard-keys.ts    generateKeyPair() via crypto.subtle.generateKey({name:"X25519"})
│                            isX25519Supported() — feature detection for fallback mode
├── hooks/
│   ├── useAuth.tsx          AuthContext: {user, session, loading, signIn, signUp, signOut}
│   │                        Persists in localStorage: "wgctrl_token" + "wgctrl_user"
│   └── useRealtimePeers.ts  SSE connection via fetch() (not EventSource — needs Auth header)
│                            Reconnects every 5s on failure. Calls getPeers() on any event.
├── pages/
│   ├── Index.tsx            Main dashboard — all panels, state management
│   ├── Auth.tsx             Sign up / sign in / password reset
│   ├── ResetPassword.tsx    Token-based password reset (/reset-password?token=X)
│   ├── JoinViaLink.tsx      Auto-join via invite link (/join/:token)
│   └── NotFound.tsx         404
└── components/
    ├── CreateNetworkPanel.tsx    Create new network
    ├── NetworkListPanel.tsx      List/delete networks
    ├── JoinNetworkPanel.tsx      Join by network ID + endpoint, key generation
    ├── PeerListPanel.tsx         Peer list with online/stale/offline status
    ├── ConfigPanel.tsx           WireGuard config display, copy, download
    ├── QRCodePanel.tsx           QR code for network ID or WireGuard config
    ├── InvitePeerPanel.tsx       Email invitation form
    ├── NetworkMembersPanel.tsx   Member list with roles, remove button
    ├── PendingInvitationsPanel.tsx  Accept/decline invitations (polls every 30s)
    ├── InviteLinkPanel.tsx       Create/list/delete invite links
    ├── ActivityLogPanel.tsx      Event timeline (polls every 15s)
    ├── ExportImportPanel.tsx     JSON export/import of network data
    ├── DashboardStats.tsx        Stats: networks, peers, online peers
    └── ui/                      shadcn/ui components (40+ files, do not modify)
```

### Frontend State Flow

```
Index.tsx holds top-level state:
  activeNetworkId: string | null   — currently selected network
  virtualIp: string | null         — this device's virtual IP after joining
  peers: Peer[]                    — current peer list
  privateKey: string               — generated X25519 private key (never sent to server)

useRealtimePeers({ networkId, enabled, onUpdate: setPeers }) — SSE updates
useAuth() — from AuthProvider in main.tsx
```

### Key Env Vars (Frontend)

| Variable | Value in production | Purpose |
|---|---|---|
| `VITE_API_URL` | `""` (empty string) | API base URL. Empty = same origin. Set in `.env.production`. |

---

## 8. SERVICES ON THE SERVER

```bash
# Check all service status:
systemctl is-active wgctrl nginx postgresql fail2ban certbot.timer

# View logs:
tail -f /var/log/wgctrl/app.log       # Go API logs
journalctl -u wgctrl -n 50            # systemd service logs
journalctl -u nginx -n 20             # Nginx logs

# Restart after changes:
systemctl restart wgctrl              # After binary update
systemctl reload nginx                # After nginx config change
```

### Firewall (UFW)
```
22/tcp  ALLOW   SSH
80/tcp  ALLOW   HTTP (redirects to HTTPS)
443/tcp ALLOW   HTTPS
```

### SSL Certificate
- Provider: Let's Encrypt via Certbot
- Valid until: 2026-05-19 (auto-renews via certbot.timer + cron at 03:00)
- Check: `certbot certificates`

### systemd Service Hardening
`wgctrl` service runs as user `wgctrl` (no shell, no home) with:
`NoNewPrivileges=yes`, `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `PrivateDevices=yes`

---

## 9. HOW TO DEPLOY CHANGES

### Update Go Backend

```python
# 1. Build locally (cross-compile)
# Run on server via SSH:
result = subprocess.run(['C:/Windows/System32/OpenSSH/ssh.exe', ...
    'cd /opt/wgctrl-src/backend && export PATH=$PATH:/usr/local/go/bin && \
     go mod tidy 2>/dev/null; \
     CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /opt/wgctrl/meshlink-server . && \
     chmod +x /opt/wgctrl/meshlink-server && \
     systemctl restart wgctrl && sleep 2 && \
     systemctl is-active wgctrl && echo OK'], ...)
```

Or package + upload:
```python
# Package backend as tarball, upload, extract on server, rebuild
import tarfile
with tarfile.open('/tmp/backend.tar.gz', 'w:gz') as tar:
    tar.add('backend/', arcname='backend/')
# SCP to server, then rebuild as above
```

### Update Frontend

```bash
# Build locally:
npm run build          # Outputs to dist/

# Upload to server (from Windows):
# Pack dist/ as tarball, SCP, extract to /opt/wgctrl/public/
```

### Database Changes

Add new migrations to `backend/db/migrations.go` `stmts` slice. They run at startup via `CREATE TABLE IF NOT EXISTS` — safe to add, never safe to DROP in migrations (do manually if needed).

---

## 10. COMMON WINDOWS-SPECIFIC GOTCHAS

These caused real issues during development — don't repeat them:

1. **CRLF line endings break bash scripts.** The `Write` tool on Windows creates CRLF files. Always convert to LF before uploading shell scripts:
   ```python
   with open('file.sh', 'rb') as f: content = f.read().replace(b'\r\n', b'\n')
   with open('file-lf.sh', 'wb') as f: f.write(content)
   ```

2. **Python `py` command, not `python3`.** On this machine: `py --version` works, `python3` does not.

3. **SSH via Python subprocess, not raw bash.** Direct `ssh` in bash tools often fails silently. Use `subprocess.run(['C:/Windows/System32/OpenSSH/ssh.exe', ...])`.

4. **Unicode decode errors from SSH output.** Always use `result.stdout.decode('utf-8', errors='replace')`.

5. **BOM in Go files.** `Set-Content -Encoding UTF8` on Windows adds a UTF-8 BOM (0xEFBBBF). Go compiler rejects this. Use Python binary write: `f.write(content.encode('utf-8'))`.

6. **PowerShell inline `!` escaping.** Python `-c` inline strings in bash escape `!` as `\!` which is invalid in TypeScript/JavaScript. Use the `Write` tool to write files instead of inline `-c` strings for frontend code.

7. **SCP with Start-Process.** Use `Start-Process -FilePath scp.exe -ArgumentList @(...) -Wait -NoNewWindow` not `&` operator (not allowed in restricted PowerShell).

---

## 11. KNOWN SQL COLUMN NAMING (avoid past bugs)

| Table | Column | Notes |
|---|---|---|
| `networks` | `owner_id` | NOT `user_id`. All network.go SQL uses `owner_id`. |
| `peers` | `user_id` | Peers DO have user_id (NOT NULL). Always INSERT with it. |
| `network_activity_logs` | `event_type`, `metadata` | Go struct fields are `Action` and `Details` but DB columns are `event_type`/`metadata`. |
| `networks` | `updated_at` | Column exists in DB but no auto-update trigger. Handler does not write it on PATCH. |

---

## 12. GO MODULE

```
module github.com/wgcloudctrl/server
go 1.22

Dependencies:
  github.com/golang-jwt/jwt/v5 v5.2.1    — JWT signing/validation
  github.com/gorilla/mux v1.8.1           — HTTP router
  github.com/lib/pq v1.10.9              — PostgreSQL driver
  golang.org/x/crypto v0.21.0            — bcrypt password hashing
```

---

## 13. ENVIRONMENT VARIABLES (on server at /etc/wgctrl/config.env)

```bash
DB_URL=postgres://wgctrl:<password>@127.0.0.1/wgctrl?sslmode=disable
JWT_SECRET=<64-char hex string>
PORT=8081
APP_URL=https://mesh.networkershome.com
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_FROM=noreply@networkershome.com
```

Secrets are stored in separate files:
- `/etc/wgctrl/db_password` — PostgreSQL password (600 perms, root:root)
- `/etc/wgctrl/jwt_secret` — JWT secret (600 perms, root:root)

---

## 14. FUTURE FEATURES (VC Moat Roadmap)

Priority-ordered features identified for competitive moat:

1. **NAT Traversal** — STUN + hole-punching + relay fallback (use `ultraslim-relay` at 139.59.93.230)
2. **Device Posture Checks** — OS version, disk encryption before peer join
3. **Policy-as-Code / ACL Engine** — group-based network access rules
4. **OIDC/SSO** — Google, GitHub, Microsoft sign-in
5. **Self-hosted DERP Relay** — fallback relay when direct connection fails
6. **Multi-Tenancy / Organizations** — multiple isolated orgs per deployment
7. **Access Groups & RBAC** — owner/admin/member/read-only roles
8. **Audit Log Export** — SIEM webhooks (Splunk, Datadog)
9. **API Keys / Service Accounts** — machine tokens for CI/CD
10. **Connection Analytics** — bandwidth/uptime dashboard per peer

See full analysis in the conversation history.

---

## 15. REPOSITORY

- **GitHub repo:** https://github.com/vikasswaminh/simple-mesh-appliance
- **Default branch:** `main`
- **Local git state:** The local repo at `C:\Users\test\Desktop\simple mesh link\simple-mesh-link\` has a local branch `appliance-main` that tracks `origin/main` on the new repo. The original `main` branch still exists locally pointing to the old Supabase history.
- **Remote name for new repo:** `appliance` (run `git push appliance appliance-main:main`)

To push new changes:
```python
subprocess.run(['git', 'add', 'backend/', 'src/', ...], cwd=project_dir)
subprocess.run(['git', 'commit', '-m', 'Your message'], cwd=project_dir)
subprocess.run(['git', 'push', 'appliance', 'appliance-main:main'], cwd=project_dir)
```

---

## 16. HEALTH CHECK

To verify everything is working end-to-end:

```bash
# From anywhere:
curl https://mesh.networkershome.com/healthz
# Expected: {"status":"ok"}

# API signup:
curl -X POST https://mesh.networkershome.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
# Expected: {"token":"eyJ...","user_id":"uuid"}

# Server services:
ssh root@64.227.164.234 'systemctl is-active wgctrl nginx postgresql'
# Expected: active\nactive\nactive
```

---

*Generated: February 2026 | Project: Simple Mesh Link / WG Cloud Ctrl*
*Next document to read: [DOCUMENTATION.md](DOCUMENTATION.md) for full API reference and user guide*
