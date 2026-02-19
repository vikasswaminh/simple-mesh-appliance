package db

import (
	"database/sql"
	"fmt"
	"log"
)

// Migrate runs inline DDL migrations idempotently.
func Migrate(db *sql.DB) error {
	stmts := []string{
		"CREATE EXTENSION IF NOT EXISTS \"pgcrypto\"",
		"CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
		"CREATE INDEX IF NOT EXISTS users_email_idx ON users (email)",
		"CREATE TABLE IF NOT EXISTS password_reset_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, used BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
		"CREATE TABLE IF NOT EXISTS networks (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
		"CREATE INDEX IF NOT EXISTS networks_owner_idx ON networks (owner_id)",
		"CREATE TABLE IF NOT EXISTS network_members (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'member', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (network_id, user_id))",
		"CREATE INDEX IF NOT EXISTS nm_network_idx ON network_members (network_id)",
		"CREATE INDEX IF NOT EXISTS nm_user_idx ON network_members (user_id)",
		"CREATE TABLE IF NOT EXISTS peers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, public_key TEXT NOT NULL, endpoint TEXT NOT NULL DEFAULT '', virtual_ip TEXT NOT NULL, last_seen TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (network_id, public_key), UNIQUE (network_id, virtual_ip))",
		"CREATE INDEX IF NOT EXISTS peers_network_idx ON peers (network_id)",
		"CREATE INDEX IF NOT EXISTS peers_user_idx ON peers (user_id)",
		"CREATE TABLE IF NOT EXISTS invitations (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE, invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, invited_email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
		"CREATE INDEX IF NOT EXISTS inv_network_idx ON invitations (network_id)",
		"CREATE INDEX IF NOT EXISTS inv_email_idx ON invitations (invited_email)",
		"CREATE TABLE IF NOT EXISTS invite_links (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE, created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT NOT NULL UNIQUE, max_uses INTEGER, uses INTEGER NOT NULL DEFAULT 0, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
		"CREATE INDEX IF NOT EXISTS il_network_idx ON invite_links (network_id)",
		"CREATE INDEX IF NOT EXISTS il_token_idx ON invite_links (token)",
		"CREATE TABLE IF NOT EXISTS network_activity_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), network_id UUID NOT NULL REFERENCES networks(id) ON DELETE CASCADE, user_id UUID REFERENCES users(id) ON DELETE SET NULL, event_type TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
		"CREATE INDEX IF NOT EXISTS al_network_idx ON network_activity_logs (network_id)",
		"CREATE INDEX IF NOT EXISTS al_created_at_idx ON network_activity_logs (created_at DESC)",
	}

	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("migration failed executing: %w", err)
		}
	}

	log.Println("database migrations complete")
	return nil
}