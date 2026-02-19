package handlers

import (
	"crypto/rand"
	"crypto/tls"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/wgcloudctrl/server/config"
	mw "github.com/wgcloudctrl/server/middleware"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	DB  *sql.DB
	Cfg *config.Config
}

func jsonOK(w http.ResponseWriter, code int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func makeJWT(userID, email, secret string) (string, error) {
	now := time.Now()
	claims := mw.Claims{UserID: userID, Email: email, RegisteredClaims: jwt.RegisteredClaims{
		IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(now.Add(24 * time.Hour))}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || len(req.Password) < 8 { jsonError(w, "email and password (min 8 chars) are required", http.StatusBadRequest); return }
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil { log.Printf("bcrypt error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	var userID string
	err = h.DB.QueryRowContext(r.Context(),
		"INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id",
		req.Email, string(hash),
	).Scan(&userID)
	if err == sql.ErrNoRows { jsonError(w, "email already registered", http.StatusConflict); return }
	if err != nil { log.Printf("signup error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	token, err := makeJWT(userID, req.Email, h.Cfg.JWTSecret)
	if err != nil { log.Printf("jwt error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	jsonOK(w, http.StatusCreated, map[string]string{"user_id": userID, "token": token})
}

func (h *AuthHandler) Signin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	var userID, hash string
	err := h.DB.QueryRowContext(r.Context(), "SELECT id, password_hash FROM users WHERE email = $1", req.Email).Scan(&userID, &hash)
	if err == sql.ErrNoRows { jsonError(w, "invalid credentials", http.StatusUnauthorized); return }
	if err != nil { log.Printf("signin error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil { jsonError(w, "invalid credentials", http.StatusUnauthorized); return }
	token, err := makeJWT(userID, req.Email, h.Cfg.JWTSecret)
	if err != nil { log.Printf("jwt error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	jsonOK(w, http.StatusOK, map[string]string{"user_id": userID, "email": req.Email, "token": token})
}

func (h *AuthHandler) Signout(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, http.StatusOK, map[string]string{"message": "signed out"})
}

func sendEmail(cfg *config.Config, to, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s", cfg.SMTPFrom, to, subject, body)
	var auth smtp.Auth
	if cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	}
	conn, err := smtp.Dial(addr)
	if err != nil { return fmt.Errorf("smtp.Dial: %w", err) }
	defer conn.Close()
	if ok, _ := conn.Extension("STARTTLS"); ok {
		tlsCfg := &tls.Config{ServerName: cfg.SMTPHost}
		if err := conn.StartTLS(tlsCfg); err != nil { return fmt.Errorf("StartTLS: %w", err) }
	}
	if auth != nil { if err := conn.Auth(auth); err != nil { return fmt.Errorf("smtp.Auth: %w", err) } }
	if err := conn.Mail(cfg.SMTPFrom); err != nil { return err }
	if err := conn.Rcpt(to); err != nil { return err }
	wc, err := conn.Data()
	if err != nil { return err }
	defer wc.Close()
	_, err = fmt.Fprint(wc, msg)
	return err
}

func (h *AuthHandler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct { Email string `json:"email"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	var userID string
	err := h.DB.QueryRowContext(r.Context(), "SELECT id FROM users WHERE email = $1", req.Email).Scan(&userID)
	if err != nil { jsonOK(w, http.StatusOK, map[string]string{"message": "if that email exists, a reset link has been sent"}); return }
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil { jsonOK(w, http.StatusOK, map[string]string{"message": "if that email exists, a reset link has been sent"}); return }
	token := hex.EncodeToString(raw)
	expires := time.Now().Add(1 * time.Hour)
	_, err = h.DB.ExecContext(r.Context(), "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)", userID, token, expires)
	if err != nil { log.Printf("reset token error: %v", err); jsonOK(w, http.StatusOK, map[string]string{"message": "if that email exists, a reset link has been sent"}); return }
	resetURL := fmt.Sprintf("%s/reset-password?token=%s", h.Cfg.AppURL, token)
	body := fmt.Sprintf("Click here to reset your password (valid 1 hour):\n%s\n", resetURL)
	go func() {
		if err := sendEmail(h.Cfg, req.Email, "Password Reset - Simple Mesh Link", body); err != nil {
			log.Printf("failed to send reset email to %s: %v", req.Email, err)
		}
	}()
	jsonOK(w, http.StatusOK, map[string]string{"message": "if that email exists, a reset link has been sent"})
}

func (h *AuthHandler) UpdatePassword(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	var req struct { Password string `json:"password"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	if len(req.Password) < 8 { jsonError(w, "password must be at least 8 characters", http.StatusBadRequest); return }
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil { log.Printf("bcrypt error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	_, err = h.DB.ExecContext(r.Context(), "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", string(hash), userID)
	if err != nil { log.Printf("update password error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	jsonOK(w, http.StatusOK, map[string]string{"message": "password updated"})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	email := mw.EmailFromContext(r.Context())
	jsonOK(w, http.StatusOK, map[string]string{"user_id": userID, "email": email})
}
