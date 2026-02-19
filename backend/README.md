# Simple Mesh Link – Go Backend

Production Go backend replacing Supabase. Implements all REST + SSE endpoints.

## Requirements

- Go 1.22+
- PostgreSQL 14+
- Network access to SMTP server

## Environment Variables

Create :

```env
DB_URL=postgres://user:password@localhost:5432/meshlink
JWT_SECRET=your-secret-key-min-32-chars
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@example.com
APP_URL=https://mesh.networkershome.com
PORT=8080
```

## Build & Run

```bash
# Install dependencies
cd backend
go mod tidy

# Build
go build -o meshlink-server .

# Run (loads env from shell)
source /etc/wgctrl/config.env
./meshlink-server
```

## Database Setup

The server auto-runs migrations on startup. Alternatively:

```bash
psql $DB_URL -f db/schema.sql
```

## API Endpoints

### Auth
- 
- 
- 
- 
-  (auth)
-  (auth)

### Networks
-  (auth)
-  (auth)
-  (auth)
-  (auth)

### Peers
-  (auth)
-  (auth)
-  (auth)

### Members
-  (auth)
-  (auth)

### Invitations
-  (auth)
-  (auth)
-  (auth)

### Invite Links
-  (auth)
-  (auth)
-  (auth)
-  (auth)

### Activity
-  (auth)

### SSE (Server-Sent Events)
-  (auth)
-  (auth)
-  (auth)

### Health
- 

## Virtual IP Allocation

Peers are assigned IPs from  to  automatically.

## Rate Limiting

10 requests/second per IP, burst of 20.

## CORS

Allowed origins: , 
