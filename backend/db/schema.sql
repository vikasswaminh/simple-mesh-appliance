-- =============================================================================
-- Simple Mesh Link -- PostgreSQL Schema
-- WireGuard mesh network manager
-- =============================================================================
-- Replaces Supabase auth.users with a self-hosted users table and adds all
-- application tables: profiles, networks, peers, network_members,
-- network_invitations, invite_links, network_activity_logs,
-- and password_reset_tokens.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- pgcrypto provides gen_random_uuid() and gen_random_bytes().
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- =============================================================================
-- TABLE: users
-- Core authentication table (replaces Supabase auth.users).
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by email during login / registration checks.
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);


-- =============================================================================
-- TABLE: profiles
-- One-to-one extension of users for public-facing profile data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS profiles (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce one profile per user and enable fast user_id lookups.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles (user_id);


-- =============================================================================
-- TABLE: networks
-- WireGuard mesh networks created and owned by a user.
-- =============================================================================

CREATE TABLE IF NOT EXISTS networks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- List all networks belonging to a specific user.
CREATE INDEX IF NOT EXISTS idx_networks_user_id ON networks (user_id);


-- =============================================================================
-- TABLE: peers
-- WireGuard peers registered within a network.
-- =============================================================================

CREATE TABLE IF NOT EXISTS peers (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID        NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
    public_key TEXT        NOT NULL,
    virtual_ip TEXT        NOT NULL,
    endpoint   TEXT        NOT NULL,
    last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A WireGuard public key must be unique per network.
    CONSTRAINT uq_peers_network_public_key UNIQUE (network_id, public_key)
);

-- List all peers for a given network.
CREATE INDEX IF NOT EXISTS idx_peers_network_id ON peers (network_id);


-- =============================================================================
-- TABLE: network_members
-- Junction table tracking which users are members of which networks.
-- role values: 'owner' | 'admin' | 'member'
-- =============================================================================

CREATE TABLE IF NOT EXISTS network_members (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID        NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
    role       TEXT        NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A user can only hold one membership record per network.
    CONSTRAINT uq_network_members_network_user UNIQUE (network_id, user_id)
);

-- Lookups by network (list members) and by user (list joined networks).
CREATE INDEX IF NOT EXISTS idx_network_members_network_id ON network_members (network_id);
CREATE INDEX IF NOT EXISTS idx_network_members_user_id    ON network_members (user_id);


-- =============================================================================
-- TABLE: network_invitations
-- Email-based invitations sent to prospective network members.
-- status values: 'pending' | 'accepted' | 'declined'
-- =============================================================================

CREATE TABLE IF NOT EXISTS network_invitations (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id    UUID        NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
    invited_by    UUID        NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
    invited_email TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query invitations by network, by invited email, or by the sending user.
CREATE INDEX IF NOT EXISTS idx_network_invitations_network_id    ON network_invitations (network_id);
CREATE INDEX IF NOT EXISTS idx_network_invitations_invited_email ON network_invitations (invited_email);
CREATE INDEX IF NOT EXISTS idx_network_invitations_invited_by    ON network_invitations (invited_by);


-- =============================================================================
-- TABLE: invite_links
-- Shareable tokenised links that allow anyone with the URL to join a network.
-- expires_at NULL means the link never expires.
-- max_uses   NULL means unlimited uses.
-- =============================================================================

CREATE TABLE IF NOT EXISTS invite_links (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID        NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    created_by UUID        NOT NULL REFERENCES users (id)    ON DELETE CASCADE,
    expires_at TIMESTAMPTZ,
    max_uses   INT,
    use_count  INT         NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- List invite links for a network or by creator.
-- The token column is already indexed via its UNIQUE constraint.
CREATE INDEX IF NOT EXISTS idx_invite_links_network_id ON invite_links (network_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_created_by ON invite_links (created_by);


-- =============================================================================
-- TABLE: network_activity_logs
-- Append-only audit log of significant events within a network.
-- user_id is nullable to support system-generated log entries.
-- =============================================================================

CREATE TABLE IF NOT EXISTS network_activity_logs (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    network_id UUID        NOT NULL REFERENCES networks (id) ON DELETE CASCADE,
    user_id    UUID        REFERENCES users (id) ON DELETE SET NULL,
    action     TEXT        NOT NULL,
    details    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fetch recent activity for a network (most common query pattern).
CREATE INDEX IF NOT EXISTS idx_activity_logs_network_id ON network_activity_logs (network_id);
-- Audit queries scoped to a specific user.
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id    ON network_activity_logs (user_id);
-- Time-range queries, newest first.
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON network_activity_logs (created_at DESC);
-- GIN index for searching inside the JSONB details payload.
CREATE INDEX IF NOT EXISTS idx_activity_logs_details_gin ON network_activity_logs USING gin (details);


-- =============================================================================
-- TABLE: password_reset_tokens
-- Single-use tokens issued during the forgot-password flow.
-- =============================================================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token      TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Look up all reset tokens for a user (e.g., to invalidate old ones on reuse).
-- The token column is already indexed via its UNIQUE constraint.
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);