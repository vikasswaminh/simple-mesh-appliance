# WG Cloud Ctrl — Complete Documentation

> WireGuard Mesh Network Manager — Self-hosted, production-ready, zero-dependency cloud controller.
> Live at: **https://mesh.networkershome.com**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [User Guide](#3-user-guide)
4. [API Reference](#4-api-reference)
5. [Database Schema](#5-database-schema)
6. [Frontend Components](#6-frontend-components)
7. [Backend Handlers](#7-backend-handlers)
8. [Real-time Events (SSE)](#8-real-time-events-sse)
9. [WireGuard Key Generation](#9-wireguard-key-generation)
10. [Configuration & Environment](#10-configuration--environment)
11. [Infrastructure & Deployment](#11-infrastructure--deployment)
12. [Security Model](#12-security-model)

---

## 1. Project Overview

**WG Cloud Ctrl** is a self-hosted web application for managing WireGuard VPN mesh networks. It replaces commercial VPN management platforms with a $12/month DigitalOcean droplet running the full stack.

### What it does

- Create and manage WireGuard mesh networks
- Invite peers by email or shareable link
- Auto-generate X25519 keypairs in the browser (private keys never leave the client)
- Assign virtual IPs from `10.10.0.0/24` automatically
- Generate WireGuard config files and QR codes for easy device setup
- Real-time peer status monitoring (online/stale/offline)
- Activity log for all network events

### Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Go 1.22, gorilla/mux |
| Database | PostgreSQL 16 |
| Auth | JWT (HS256, 24h expiry), bcrypt |
| Real-time | Server-Sent Events (SSE) |
| Crypto | Web Crypto API (X25519/Curve25519) |
| Proxy | Nginx (HTTP/2, TLS termination) |
| SSL | Let's Encrypt via Certbot |

---

## 2. Architecture

```
Browser (React SPA)
        |
        | HTTPS (Cloudflare proxied)
        |
   Nginx :443
   ├── /api/*      → proxy → Go API :8081
   ├── /api/sse/*  → proxy → Go SSE  :8081  (unbuffered, 1hr timeout)
   ├── /healthz    → proxy → Go API  :8081
   └── /*          → static files /opt/wgctrl/public/
        |
   Go API :8081
   ├── Auth handlers     (signup, signin, JWT)
   ├── Networks handlers (CRUD)
   ├── Peers handlers    (join, list, delete)
   ├── Members handlers  (list, remove)
   ├── Invitations       (email + link-based)
   ├── Activity logs     (JSONB event log)
   ├── SSE Broker        (in-memory pub/sub)
   └── Middleware        (CORS, JWT auth, rate limit)
        |
   PostgreSQL :5432 (local, socket)
```

### Key Design Decisions

- **Private keys never reach the server.** The browser generates X25519 keypairs; only the public key is sent to the API.
- **No external dependencies.** No Supabase, no Firebase, no third-party auth. Fully self-hosted.
- **Single machine.** Go binary + PostgreSQL + Nginx on one $12/mo droplet.
- **JWT stateless auth.** No session table; tokens are verified with HMAC-SHA256.

---

## 3. User Guide

### 3.1 Creating an Account

1. Navigate to **https://mesh.networkershome.com**
2. Click **Sign Up**
3. Enter your email and a password (minimum 8 characters)
4. You are automatically signed in after registration

### 3.2 Creating a Network

1. On the dashboard, find the **Create Network** panel
2. Enter a network name (optional — defaults to "My Network")
3. Enter a description (optional)
4. Click **Create Network**
5. Your new network appears in the **Network List** panel
6. Copy the **Network ID** — share it with peers who need to join

### 3.3 Joining a Network

#### Method A — Direct Join (with Network ID)

1. Obtain the Network ID from the network owner
2. In the **Join Network** panel, paste the Network ID
3. Enter your endpoint in `ip:port` format (e.g., `203.0.113.5:51820`)
   - This is your public IP and the WireGuard listen port
   - Leave blank if you are behind NAT (peers will still connect to you via keepalive)
4. Click **Join Network**
5. The app auto-generates an X25519 keypair in your browser
6. You receive a **virtual IP** (e.g., `10.10.0.3`) and a ready-to-use WireGuard config

#### Method B — Invite Link

1. The network owner creates an invite link in the **Invite Link** panel
2. You receive the link (e.g., `https://mesh.networkershome.com/join/TOKEN`)
3. Visit the link while logged in — you are automatically added as a member
4. Then use **Join Network** with the Network ID to register your peer

#### Method C — Email Invitation

1. The network owner uses the **Invite Peer** panel and enters your email
2. You see a pending invitation in the **Pending Invitations** panel (polled every 30s)
3. Click **Accept** — you are added to the network as a member
4. Then use **Join Network** to register your peer

### 3.4 Downloading Your WireGuard Config

After joining a network:

1. Your config appears in the **Config** panel on the right side of the dashboard
2. Click **Copy** to copy to clipboard, or **Download** to save as `wg0.conf`
3. On your device: `sudo wg-quick up wg0.conf`

Config format:
```ini
[Interface]
PrivateKey = <your-private-key>
Address = 10.10.0.3/24

[Peer]
PublicKey = <other-peer-public-key>
Endpoint = 203.0.113.1:51820
AllowedIPs = 10.10.0.2/32
PersistentKeepalive = 25
```

### 3.5 Getting a QR Code

1. Go to the **QR Code** panel
2. Choose **Network ID** mode (share the network with others) or **Config** mode (import config into WireGuard mobile app)
3. Scan with a WireGuard mobile app to instantly import the config

### 3.6 Monitoring Peers

The **Peer List** panel shows all peers in the active network:

| Status | Meaning |
|---|---|
| Online (green) | Last seen < 30 seconds ago |
| Stale (yellow) | Last seen 30–60 seconds ago |
| Offline (red) | Last seen > 60 seconds ago or never |

Peer status updates in real time via SSE.

### 3.7 Inviting Members

1. Open the **Invite Peer** panel
2. Enter the email address of the person you want to invite
3. Click **Send Invitation**
4. The invitee sees the pending invitation in their dashboard

### 3.8 Managing Members

The **Network Members** panel shows all members with their role (Owner/Member):

- **Owner** — created the network; can delete it, remove members, manage invite links
- **Member** — can join as a peer, invite others, view peer list

To remove a member, click the remove icon next to their name. The owner cannot be removed.

### 3.9 Invite Links

Invite links allow one-click network access without email:

1. Open the **Invite Link** panel
2. Optionally set a **Max Uses** limit
3. Click **Create Link**
4. Share the generated URL — anyone with it can join (up to the use limit)
5. Delete a link to immediately revoke access

### 3.10 Activity Log

The **Activity Log** panel shows a timeline of all events in the active network:

- `network_created` — Network was created
- `peer_joined` — A peer registered (with their virtual IP)
- `peer_left` — A peer was removed
- `member_joined` — A user accepted an invitation
- `member_removed` — A member was removed
- `invitation_sent` — An email invitation was sent

### 3.11 Password Reset

1. On the sign-in page, click **Forgot password?**
2. Enter your email — a reset link is sent
3. Click the link in the email
4. Enter a new password (minimum 8 characters)

### 3.12 Exporting / Importing Network Data

The **Export/Import** panel lets you:
- **Export** — Download a JSON file with your network metadata and peer list
- **Import** — Restore from a previously exported JSON file

---

## 4. API Reference

Base URL: `https://mesh.networkershome.com/api`

All protected endpoints require:
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

---

### 4.1 Authentication

#### POST /auth/signup
Register a new user.

**Request:**
```json
{ "email": "user@example.com", "password": "mypassword" }
```

**Response 201:**
```json
{ "token": "<jwt>", "user_id": "<uuid>" }
```

**Errors:** `400 Bad Request` (invalid input or email taken)

---

#### POST /auth/signin
Sign in with email and password.

**Request:**
```json
{ "email": "user@example.com", "password": "mypassword" }
```

**Response 200:**
```json
{ "token": "<jwt>", "user_id": "<uuid>", "email": "user@example.com" }
```

**Errors:** `401 Unauthorized` (invalid credentials)

---

#### POST /auth/signout
Sign out (client-side cleanup; token remains valid until expiry).

**Response 200:**
```json
{ "message": "signed out" }
```

---

#### GET /auth/me *(Protected)*
Get current user info.

**Response 200:**
```json
{ "user_id": "<uuid>", "email": "user@example.com" }
```

---

#### POST /auth/reset-password
Request a password reset email.

**Request:**
```json
{ "email": "user@example.com" }
```

**Response 200:** (always 200 to prevent email enumeration)
```json
{ "message": "if that email exists, a reset link has been sent" }
```

---

#### POST /auth/update-password *(Protected)*
Update password using reset token or current JWT.

**Request:**
```json
{ "password": "newpassword" }
```

**Response 200:**
```json
{ "message": "password updated" }
```

---

### 4.2 Networks

#### POST /networks/create *(Protected)*
Create a new WireGuard network.

**Request:**
```json
{ "name": "My Network", "description": "Home lab VPN" }
```

**Response 201:**
```json
{ "network_id": "<uuid>" }
```

---

#### GET /networks *(Protected)*
List all networks the user belongs to.

**Response 200:**
```json
[
  {
    "id": "<uuid>",
    "name": "My Network",
    "description": "Home lab VPN",
    "created_at": "2026-02-18T10:00:00Z"
  }
]
```

---

#### PATCH /networks/:id *(Protected)*
Update network name or description. Owner only.

**Request:**
```json
{ "name": "New Name", "description": "New description" }
```

**Response 200:**
```json
{ "message": "updated" }
```

---

#### DELETE /networks/:id *(Protected)*
Delete a network and all its data. Owner only.

**Response 200:**
```json
{ "message": "deleted" }
```

---

### 4.3 Peers

#### POST /peers/join *(Protected)*
Register a peer in a network. User must already be a network member.

**Request:**
```json
{
  "network_id": "<uuid>",
  "public_key": "<base64-encoded-x25519-public-key>",
  "endpoint": "203.0.113.5:51820"
}
```

**Response 200:**
```json
{
  "virtual_ip": "10.10.0.2",
  "peers": [
    {
      "id": "<uuid>",
      "network_id": "<uuid>",
      "user_id": "<uuid>",
      "public_key": "<base64>",
      "endpoint": "203.0.113.5:51820",
      "virtual_ip": "10.10.0.2",
      "last_seen": null,
      "created_at": "2026-02-18T10:00:00Z"
    }
  ]
}
```

**Notes:**
- If the public key already exists in the network, the endpoint and `last_seen` are updated (upsert)
- Virtual IPs are assigned sequentially from `10.10.0.2` to `10.10.0.254`

---

#### GET /peers?network_id=:id *(Protected)*
List all peers in a network.

**Response 200:**
```json
{
  "peers": [ { ... } ]
}
```

---

#### DELETE /peers/:id *(Protected)*
Remove a peer from the network.

**Response 200:**
```json
{ "message": "peer removed" }
```

---

### 4.4 Members

#### GET /networks/:id/members *(Protected)*
List all members of a network.

**Response 200:**
```json
[
  {
    "id": "<uuid>",
    "network_id": "<uuid>",
    "user_id": "<uuid>",
    "role": "owner",
    "created_at": "2026-02-18T10:00:00Z",
    "email": "owner@example.com"
  }
]
```

---

#### DELETE /members/:id *(Protected)*
Remove a member from a network. Requester must be owner.

**Response 200:**
```json
{ "message": "member removed" }
```

---

### 4.5 Invitations

#### POST /invitations *(Protected)*
Invite a user to a network by email.

**Request:**
```json
{ "network_id": "<uuid>", "invited_email": "peer@example.com" }
```

**Response 201:**
```json
{ "invitation_id": "<uuid>" }
```

---

#### GET /invitations/pending *(Protected)*
Get all pending invitations for the current user.

**Response 200:**
```json
[
  {
    "id": "<uuid>",
    "network_id": "<uuid>",
    "invited_by": "<uuid>",
    "invited_email": "you@example.com",
    "status": "pending",
    "created_at": "2026-02-18T10:00:00Z"
  }
]
```

---

#### POST /invitations/accept *(Protected)*
Accept or decline a pending invitation.

**Request:**
```json
{ "invitation_id": "<uuid>", "action": "accept" }
```
`action` is `"accept"` or `"decline"`.

**Response 200 (accepted):**
```json
{ "network_id": "<uuid>" }
```

**Response 200 (declined):**
```json
{ "message": "invitation declined" }
```

---

### 4.6 Invite Links

#### POST /invite-links *(Protected)*
Create a shareable invite link for a network.

**Request:**
```json
{ "network_id": "<uuid>", "max_uses": 10 }
```
`max_uses` is optional (null = unlimited).

**Response 201:**
```json
{
  "id": "<uuid>",
  "network_id": "<uuid>",
  "token": "<random-token>",
  "max_uses": 10,
  "uses": 0,
  "expires_at": null,
  "created_at": "2026-02-18T10:00:00Z"
}
```

The shareable URL is: `https://mesh.networkershome.com/join/<token>`

---

#### GET /invite-links?network_id=:id *(Protected)*
List invite links for a network.

**Response 200:** Array of invite link objects.

---

#### DELETE /invite-links/:id *(Protected)*
Delete an invite link (revokes access immediately).

**Response 200:**
```json
{ "message": "invite link deleted" }
```

---

#### POST /invite-links/join *(Protected)*
Join a network using an invite token.

**Request:**
```json
{ "token": "<token-from-url>" }
```

**Response 200:**
```json
{ "network_id": "<uuid>" }
```

**Errors:**
- `404` — Token not found
- `410 Gone` — Token expired or max uses reached

---

### 4.7 Activity Logs

#### GET /activity?network_id=:id&limit=50 *(Protected)*
Get activity logs for a network.

**Query params:**
- `network_id` — required
- `limit` — optional, default 50, max 200

**Response 200:**
```json
[
  {
    "id": "<uuid>",
    "network_id": "<uuid>",
    "user_id": "<uuid>",
    "action": "peer_joined",
    "details": { "public_key": "...", "virtual_ip": "10.10.0.2" },
    "created_at": "2026-02-18T10:00:00Z"
  }
]
```

---

### 4.8 Server-Sent Events

#### GET /sse/peers?network_id=:id *(Protected)*
Real-time stream of peer updates for a network.

**Headers required:**
```
Authorization: Bearer <token>
```

**Events emitted:**
```
event: peer_joined
data: [<peer-array>]

event: peer_left
data: [<peer-array>]

event: ping
data: {}
```

---

#### GET /sse/invitations *(Protected)*
Real-time stream of invitation events for the current user.

**Events emitted:**
```
event: invitation_received
data: { invitation_id, network_id, invited_by }
```

---

#### GET /sse/activity?network_id=:id *(Protected)*
Real-time stream of activity events for a network.

---

### 4.9 Health Check

#### GET /healthz
No auth required. Returns server status.

**Response 200:**
```json
{ "status": "ok" }
```

---

## 5. Database Schema

All tables use UUID primary keys with `gen_random_uuid()`.

### users
```sql
id           UUID  PRIMARY KEY DEFAULT gen_random_uuid()
email        TEXT  NOT NULL UNIQUE
password_hash TEXT NOT NULL
created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### networks
```sql
id          UUID  PRIMARY KEY DEFAULT gen_random_uuid()
owner_id    UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE
name        TEXT  NOT NULL
description TEXT  NOT NULL DEFAULT ''
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### network_members
```sql
id          UUID  PRIMARY KEY DEFAULT gen_random_uuid()
network_id  UUID  NOT NULL REFERENCES networks(id) ON DELETE CASCADE
user_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE
role        TEXT  NOT NULL DEFAULT 'member'   -- 'owner', 'member'
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
UNIQUE (network_id, user_id)
```

### peers
```sql
id          UUID  PRIMARY KEY DEFAULT gen_random_uuid()
network_id  UUID  NOT NULL REFERENCES networks(id) ON DELETE CASCADE
user_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE
public_key  TEXT  NOT NULL
endpoint    TEXT  NOT NULL DEFAULT ''
virtual_ip  TEXT  NOT NULL
last_seen   TIMESTAMPTZ
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
UNIQUE (network_id, public_key)
UNIQUE (network_id, virtual_ip)
```

### invitations
```sql
id            UUID  PRIMARY KEY DEFAULT gen_random_uuid()
network_id    UUID  NOT NULL REFERENCES networks(id) ON DELETE CASCADE
invited_by    UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE
invited_email TEXT  NOT NULL
status        TEXT  NOT NULL DEFAULT 'pending'  -- 'pending', 'accepted', 'declined'
created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### invite_links
```sql
id          UUID     PRIMARY KEY DEFAULT gen_random_uuid()
network_id  UUID     NOT NULL REFERENCES networks(id) ON DELETE CASCADE
created_by  UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE
token       TEXT     NOT NULL UNIQUE
max_uses    INTEGER               -- NULL = unlimited
uses        INTEGER  NOT NULL DEFAULT 0
expires_at  TIMESTAMPTZ           -- NULL = never
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### password_reset_tokens
```sql
id          UUID  PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE
token       TEXT  NOT NULL UNIQUE
expires_at  TIMESTAMPTZ NOT NULL
used        BOOLEAN NOT NULL DEFAULT FALSE
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### network_activity_logs
```sql
id          UUID  PRIMARY KEY DEFAULT gen_random_uuid()
network_id  UUID  NOT NULL REFERENCES networks(id) ON DELETE CASCADE
user_id     UUID  REFERENCES users(id) ON DELETE SET NULL
event_type  TEXT  NOT NULL
metadata    JSONB NOT NULL DEFAULT '{}'
created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

---

## 6. Frontend Components

### Pages

| Page | Path | Description |
|---|---|---|
| Dashboard | `/` | Main app UI — all panels |
| Auth | `/auth` | Sign up / sign in / password reset |
| Reset Password | `/reset-password?token=` | Set new password with reset token |
| Join Via Link | `/join/:token` | Auto-join network via invite link |
| Not Found | `*` | 404 page |

### Panels (Dashboard)

| Component | File | Purpose |
|---|---|---|
| DashboardStats | `DashboardStats.tsx` | Counters: networks, peers, online peers |
| CreateNetworkPanel | `CreateNetworkPanel.tsx` | Form to create a new network |
| NetworkListPanel | `NetworkListPanel.tsx` | List of joined networks with delete |
| JoinNetworkPanel | `JoinNetworkPanel.tsx` | Join a network by ID + endpoint |
| PeerListPanel | `PeerListPanel.tsx` | Peers in active network with status |
| ConfigPanel | `ConfigPanel.tsx` | WireGuard config display + download |
| QRCodePanel | `QRCodePanel.tsx` | QR codes for network ID or config |
| InvitePeerPanel | `InvitePeerPanel.tsx` | Email invitation form |
| NetworkMembersPanel | `NetworkMembersPanel.tsx` | Member list with role and remove |
| PendingInvitationsPanel | `PendingInvitationsPanel.tsx` | Accept/decline incoming invitations |
| InviteLinkPanel | `InviteLinkPanel.tsx` | Create and manage invite links |
| ActivityLogPanel | `ActivityLogPanel.tsx` | Timeline of network events |
| ExportImportPanel | `ExportImportPanel.tsx` | JSON export/import of network data |

### Hooks

| Hook | File | Returns |
|---|---|---|
| `useAuth()` | `useAuth.tsx` | `{ user, session, loading, signIn, signUp, signOut }` |
| `useRealtimePeers()` | `useRealtimePeers.ts` | Subscribes to SSE, calls `onUpdate(peers)` |

---

## 7. Backend Handlers

### Handler Structure

Each handler is a Go struct with a `*sql.DB` and optionally a `*sse.Broker`:

```go
type NetworksHandler struct {
    DB     *sql.DB
    Broker *sse.Broker
}
```

### Middleware Chain

Every request passes through:
1. **CORS** — sets Access-Control headers, handles OPTIONS preflight
2. **RateLimit** — token bucket per IP (10 req/s, burst 20); returns 429 if exceeded
3. **jsonLogging** — logs `method path status duration_ms` to stdout

Protected routes additionally pass through:
4. **Auth** — validates `Authorization: Bearer <token>`, injects `userID` and `email` into context

### Handler Files

| File | Struct | Endpoints |
|---|---|---|
| `auth.go` | `AuthHandler` | signup, signin, signout, me, reset-password, update-password |
| `networks.go` | `NetworksHandler` | create, list, update, delete |
| `peers.go` | `PeersHandler` | join, list, delete |
| `members.go` | `MembersHandler` | list, remove |
| `invitations.go` | `InvitationsHandler` | create, pending, accept |
| `invite_links.go` | `InviteLinksHandler` | create, list, delete, join |
| `activity.go` | `ActivityHandler` | list, logActivity() helper |
| `sse.go` | `SSEHandler` | peers stream, invitations stream, activity stream |

---

## 8. Real-time Events (SSE)

The SSE broker maintains an in-memory subscriber registry. Each SSE connection subscribes to one or more **topics**.

### Topics

| Topic Pattern | Used by | Triggered when |
|---|---|---|
| `peers:{networkId}` | `/sse/peers` | Peer joins or leaves a network |
| `user:{userId}` | `/sse/invitations` | Invitation received by user |
| `activity:{networkId}` | `/sse/activity` | Any activity event in network |

### Event Format (wire format)

```
event: peer_joined
data: [{"id":"...","virtual_ip":"10.10.0.2",...}]

event: ping
data: {}
```

### Frontend SSE Connection

The frontend uses `fetch()` instead of `EventSource` to allow sending `Authorization: Bearer` headers (EventSource does not support custom headers):

```typescript
const resp = await fetch("/api/sse/peers?network_id=...", {
    headers: { "Authorization": "Bearer " + token }
});
const reader = resp.body.getReader();
// Reads chunks, splits on "\n\n", re-fetches peers on any event
```

On disconnect, the client automatically reconnects after 5 seconds.

---

## 9. WireGuard Key Generation

File: `src/lib/wireguard-keys.ts`

### How it works

Keys are generated using the browser's native **Web Crypto API** (`crypto.subtle`), which provides hardware-accelerated, cryptographically secure X25519 (Curve25519) keypairs — the same algorithm WireGuard uses.

```typescript
const keyPair = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,          // extractable
    ["deriveBits"]
);

// Export private key (PKCS8 format — last 32 bytes are the raw key)
const rawPrivate = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
const privateBytes = new Uint8Array(rawPrivate).slice(-32);

// Export public key (raw 32 bytes)
const rawPublic = await crypto.subtle.exportKey("raw", keyPair.publicKey);
```

### Security properties

- Private key is **never transmitted** to the server
- Private key is only held in React component state during the session
- After page refresh, the private key is gone — users should download the config file immediately
- The server only ever sees the public key

### Browser support

X25519 requires a browser that supports `crypto.subtle.generateKey` with `{ name: "X25519" }`. Supported in:
- Chrome 113+
- Firefox 130+
- Safari 15.4+ (HTTPS only)
- Edge 113+

Requires a **secure context** (HTTPS or localhost). The app falls back to **manual key entry** mode if X25519 is unavailable.

---

## 10. Configuration & Environment

### Frontend

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `""` | API base URL. Empty = same origin. Set in `.env.production`. |

### Backend

| Variable | Required | Default | Description |
|---|---|---|---|
| `DB_URL` | Yes | — | PostgreSQL DSN, e.g. `postgres://wgctrl:pass@127.0.0.1/wgctrl?sslmode=disable` |
| `JWT_SECRET` | Yes | — | Random hex string for JWT signing. Must be kept secret. |
| `PORT` | No | `8080` | HTTP listen port |
| `APP_URL` | No | `http://localhost:5173` | Frontend URL (used in password reset emails) |
| `SMTP_HOST` | No | `localhost` | Mail server hostname |
| `SMTP_PORT` | No | `587` | Mail server port |
| `SMTP_USER` | No | `""` | SMTP username |
| `SMTP_PASS` | No | `""` | SMTP password |
| `SMTP_FROM` | No | `noreply@example.com` | From address for emails |

Config is loaded from `/etc/wgctrl/config.env` on the production server (injected via systemd `EnvironmentFile`).

---

## 11. Infrastructure & Deployment

### Production Server

| Item | Value |
|---|---|
| Provider | DigitalOcean |
| Droplet | `mesh-wgctrl` |
| Region | Bangalore (blr1) |
| Size | s-1vcpu-2gb ($12/mo) |
| OS | Ubuntu 24.04 LTS |
| IP | 64.227.164.234 |
| Domain | mesh.networkershome.com (Cloudflare proxied) |

### File Locations

| Path | Contents |
|---|---|
| `/opt/wgctrl/meshlink-server` | Go binary |
| `/opt/wgctrl/public/` | Frontend static files (built React app) |
| `/etc/wgctrl/config.env` | Environment variables (600 permissions) |
| `/etc/wgctrl/db_password` | PostgreSQL password (600 permissions) |
| `/etc/wgctrl/jwt_secret` | JWT secret (600 permissions) |
| `/var/log/wgctrl/app.log` | Application logs |
| `/var/backups/wgctrl/` | Daily PostgreSQL backups (30-day retention) |

### Services

```bash
systemctl status wgctrl       # Go API server
systemctl status nginx        # Reverse proxy
systemctl status postgresql   # Database
systemctl status fail2ban     # Brute-force protection
systemctl status certbot.timer # SSL auto-renewal
```

### Firewall (UFW)

```
22/tcp   ALLOW   (SSH)
80/tcp   ALLOW   (HTTP → redirected to HTTPS)
443/tcp  ALLOW   (HTTPS)
```

### SSL Certificate

- Provider: Let's Encrypt
- Auto-renews via `certbot.timer` systemd timer
- Also a daily cron at 03:00: `certbot renew --quiet --post-hook 'systemctl reload nginx'`
- Certificate expiry visible at: `certbot certificates`

### Updating the Backend

```bash
# From local machine — rebuild and redeploy
cd backend/
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o meshlink-server .
scp meshlink-server root@64.227.164.234:/opt/wgctrl/meshlink-server
ssh root@64.227.164.234 'systemctl restart wgctrl'
```

### Updating the Frontend

```bash
# From local machine — rebuild and redeploy
npm run build
scp -r dist/* root@64.227.164.234:/opt/wgctrl/public/
```

### Database Backup and Restore

```bash
# Manual backup
sudo -u postgres pg_dump wgctrl | gzip > /tmp/wgctrl-$(date +%Y%m%d).sql.gz

# Restore
gunzip -c /var/backups/wgctrl/db-20260218.sql.gz | sudo -u postgres psql wgctrl
```

---

## 12. Security Model

### Authentication

- Passwords hashed with **bcrypt** (cost factor default ~10)
- JWTs signed with **HMAC-SHA256**, 24-hour expiry
- No refresh tokens — re-login required after expiry
- Password reset tokens expire in 1 hour and are single-use

### Authorization

- All API endpoints (except signup, signin, signout, reset-password, healthz) require a valid JWT
- Network operations check membership via `network_members` table before acting
- Delete operations verify ownership (`owner_id` check) for destructive actions

### Cryptography

- WireGuard keys: X25519 (Curve25519) via browser Web Crypto API
- Private keys never transmitted — all key generation is client-side
- TLS: Let's Encrypt, Nginx terminates with HTTP/2 and HSTS (max-age 63072000)

### Rate Limiting

- Token bucket: **10 requests/second**, burst of **20** per IP
- IP detection is Cloudflare-aware (uses `CF-Connecting-IP` → `X-Forwarded-For` → `X-Real-IP`)
- Returns `429 Too Many Requests` when exceeded

### Security Headers (Nginx)

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### systemd Hardening

The `wgctrl` service runs with:
```
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
```

The service runs as a dedicated `wgctrl` user with no shell and no home directory write access.

### Fail2Ban

Monitors SSH login attempts and blocks IPs after repeated failures.

---

*Last updated: February 2026*
*Deployed version: Go 1.22 backend, React 18 frontend*
