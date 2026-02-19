package config

import (
	"fmt"
	"os"
	"strconv"
)

// Config holds all application configuration loaded from environment variables.
type Config struct {
	DBURL     string
	JWTSecret string
	SMTPHost  string
	SMTPPort  int
	SMTPUser  string
	SMTPPass  string
	SMTPFrom  string
	AppURL    string
	Port      string
}

// Load reads configuration from environment variables.
func Load() (*Config, error) {
	c := &Config{}
	c.DBURL     = mustEnv("DB_URL")
	c.JWTSecret = mustEnv("JWT_SECRET")
	c.SMTPHost  = getEnv("SMTP_HOST", "localhost")
	smtpPortStr := getEnv("SMTP_PORT", "587")
	port, err := strconv.Atoi(smtpPortStr)
	if err != nil {
		return nil, fmt.Errorf("invalid SMTP_PORT %q: %w", smtpPortStr, err)
	}
	c.SMTPPort = port
	c.SMTPUser = getEnv("SMTP_USER", "")
	c.SMTPPass = getEnv("SMTP_PASS", "")
	c.SMTPFrom = getEnv("SMTP_FROM", "noreply@example.com")
	c.AppURL   = getEnv("APP_URL", "http://localhost:5173")
	c.Port     = getEnv("PORT", "8080")
	return c, nil
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		fmt.Fprintf(os.Stderr, "FATAL: required environment variable %s is not set\n", key)
		os.Exit(1)
	}
	return v
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
