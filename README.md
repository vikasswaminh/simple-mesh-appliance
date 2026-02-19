# Simple Mesh Appliance

> Self-hosted WireGuard mesh network manager — Go + PostgreSQL + React on a single $12/mo server.

**Live demo:** https://mesh.networkershome.com

---

## What it is

A complete WireGuard VPN mesh controller you can run on any Ubuntu server. Replaces commercial mesh VPN products and Supabase-based backends with a fully self-contained appliance.

- Create and manage WireGuard mesh networks
- Invite peers by email or shareable link
- Auto-generate X25519 keypairs in the browser (private keys never leave the client)
- Assign virtual IPs from `10.10.0.0/24` automatically
- Export WireGuard config files and QR codes
- Real-time peer status (online/stale/offline) via Server-Sent Events
- Full activity log

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui |
| Backend | Go 1.22, gorilla/mux |
| Database | PostgreSQL 16 (auto-migrated at startup) |
| Auth | JWT HS256 + bcrypt |
| Real-time | Server-Sent Events (SSE) |
| Crypto | Web Crypto API (X25519 / Curve25519) |
| Proxy | Nginx + Let's Encrypt |

## Quick Deploy (Ubuntu 24.04)

```bash
# On a fresh Ubuntu 24.04 droplet as root:
git clone https://github.com/vikasswaminh/simple-mesh-appliance.git /opt/wgctrl-src
bash /opt/wgctrl-src/deploy/deploy.sh
```

The script installs Go, Node.js, PostgreSQL, Nginx, Certbot, and configures everything end-to-end.

**Requirements:**
- Ubuntu 24.04 LTS
- DNS A record pointing your domain to the server IP (before running the script)
- Update `DOMAIN` in `deploy/deploy.sh` to match your domain

## Local Development

**Backend:**
```bash
cd backend
export DB_URL="postgres://user:pass@localhost/wgctrl?sslmode=disable"
export JWT_SECRET="your-secret"
go run .
# API available at http://localhost:8081
```

**Frontend:**
```bash
npm install
npm run dev
# UI available at http://localhost:5173
```

## Project Structure

```
├── backend/
│   ├── main.go              # Router, middleware, server setup
│   ├── config/config.go     # Environment variable loading
│   ├── db/
│   │   ├── db.go            # Connection pool
│   │   ├── migrations.go    # Auto-run DDL at startup
│   │   └── schema.sql       # Reference schema
│   ├── handlers/            # HTTP handler per resource
│   ├── middleware/          # Auth (JWT), CORS, rate limit
│   └── sse/broker.go        # In-memory pub/sub for SSE
├── src/
│   ├── lib/
│   │   ├── api.ts           # All REST API calls
│   │   └── wireguard-keys.ts # X25519 key generation (WebCrypto)
│   ├── hooks/
│   │   ├── useAuth.tsx      # JWT auth context
│   │   └── useRealtimePeers.ts # SSE peer updates
│   ├── components/          # UI panels
│   └── pages/               # Route pages
├── deploy/
│   └── deploy.sh            # Full production deploy script
└── DOCUMENTATION.md         # Full technical documentation
```

## API

All endpoints under `/api/`. See [DOCUMENTATION.md](DOCUMENTATION.md) for the full API reference.

```
POST /api/auth/signup
POST /api/auth/signin
POST /api/networks/create
GET  /api/networks
POST /api/peers/join
GET  /api/peers
GET  /api/sse/peers        (Server-Sent Events)
```

## Security

- Private keys are generated in-browser and never transmitted
- bcrypt password hashing
- JWT authentication on all protected routes
- Rate limiting: 10 req/s per IP (burst 20)
- UFW firewall: ports 22, 80, 443 only
- systemd service hardening (NoNewPrivileges, ProtectSystem, PrivateTmp)
- HSTS, X-Frame-Options, X-Content-Type-Options headers

## License

MIT
