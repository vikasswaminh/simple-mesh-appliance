package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/wgcloudctrl/server/sse"
	mw "github.com/wgcloudctrl/server/middleware"
)

type InviteLinksHandler struct { DB *sql.DB; Broker *sse.Broker }

type InviteLink struct {
	ID        string     `json:"id"`
	NetworkID string     `json:"network_id"`
	CreatedBy string     `json:"created_by"`
	Token     string     `json:"token"`
	MaxUses   *int       `json:"max_uses"`
	Uses      int        `json:"uses"`
	ExpiresAt *time.Time `json:"expires_at"`
	CreatedAt time.Time  `json:"created_at"`
}

func generateToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil { return "", err }
	return base64.URLEncoding.EncodeToString(b), nil
}
func (h *InviteLinksHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	var req struct { NetworkID string `json:"network_id"`; MaxUses *int `json:"max_uses"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	if req.NetworkID == "" { jsonError(w, "network_id is required", http.StatusBadRequest); return }
	var mc int
	err := h.DB.QueryRowContext(r.Context(), "SELECT 1 FROM network_members WHERE network_id = $1 AND user_id = $2", req.NetworkID, userID).Scan(&mc)
	if err == sql.ErrNoRows { jsonError(w, "not a member of this network", http.StatusForbidden); return }
	if err != nil { jsonError(w, "internal error", http.StatusInternalServerError); return }
	token, err := generateToken()
	if err != nil { log.Printf("generate token error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	var link InviteLink
	err = h.DB.QueryRowContext(r.Context(), "INSERT INTO invite_links (network_id, created_by, token, max_uses) VALUES ($1,$2,$3,$4) RETURNING id, network_id, created_by, token, max_uses, uses, expires_at, created_at", req.NetworkID, userID, token, req.MaxUses).Scan(&link.ID, &link.NetworkID, &link.CreatedBy, &link.Token, &link.MaxUses, &link.Uses, &link.ExpiresAt, &link.CreatedAt)
	if err != nil { log.Printf("create invite link error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	jsonOK(w, http.StatusCreated, link)
}

func (h *InviteLinksHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	networkID := r.URL.Query().Get("network_id")
	if networkID == "" { jsonError(w, "network_id is required", http.StatusBadRequest); return }
	var mc int
	err := h.DB.QueryRowContext(r.Context(), "SELECT 1 FROM network_members WHERE network_id = $1 AND user_id = $2", networkID, userID).Scan(&mc)
	if err == sql.ErrNoRows { jsonError(w, "not a member", http.StatusForbidden); return }
	if err != nil { jsonError(w, "internal error", http.StatusInternalServerError); return }
	rows, err := h.DB.QueryContext(r.Context(), "SELECT id, network_id, created_by, token, max_uses, uses, expires_at, created_at FROM invite_links WHERE network_id = $1 ORDER BY created_at DESC", networkID)
	if err != nil { log.Printf("list invite links error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	defer rows.Close()
	var links []InviteLink
	for rows.Next() {
		var l InviteLink
		if err := rows.Scan(&l.ID, &l.NetworkID, &l.CreatedBy, &l.Token, &l.MaxUses, &l.Uses, &l.ExpiresAt, &l.CreatedAt); err != nil { continue }
		links = append(links, l)
	}
	if links == nil { links = []InviteLink{} }
	jsonOK(w, http.StatusOK, links)
}

func (h *InviteLinksHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	linkID := mux.Vars(r)["id"]
	res, err := h.DB.ExecContext(r.Context(), "DELETE FROM invite_links WHERE id = $1 AND created_by = $2", linkID, userID)
	if err != nil { log.Printf("delete invite link error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	n, _ := res.RowsAffected()
	if n == 0 { jsonError(w, "invite link not found", http.StatusNotFound); return }
	jsonOK(w, http.StatusOK, map[string]string{"message": "invite link deleted"})
}
func (h *InviteLinksHandler) JoinByToken(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	var req struct { Token string `json:"token"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	if req.Token == "" { jsonError(w, "token is required", http.StatusBadRequest); return }
	var link InviteLink
	err := h.DB.QueryRowContext(r.Context(), "SELECT id, network_id, max_uses, uses, expires_at FROM invite_links WHERE token = $1", req.Token).Scan(&link.ID, &link.NetworkID, &link.MaxUses, &link.Uses, &link.ExpiresAt)
	if err == sql.ErrNoRows { jsonError(w, "invalid or expired invite link", http.StatusNotFound); return }
	if err != nil { log.Printf("invite link query error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	if link.ExpiresAt != nil && link.ExpiresAt.Before(time.Now()) { jsonError(w, "invite link has expired", http.StatusGone); return }
	if link.MaxUses != nil && link.Uses >= *link.MaxUses { jsonError(w, "invite link has reached max uses", http.StatusGone); return }
	_, err = h.DB.ExecContext(r.Context(), "INSERT INTO network_members (network_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT (network_id, user_id) DO NOTHING", link.NetworkID, userID)
	if err != nil { log.Printf("add member via invite link error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	_, err = h.DB.ExecContext(r.Context(), "UPDATE invite_links SET uses = uses + 1 WHERE id = $1", link.ID)
	if err != nil { log.Printf("increment invite link uses error: %v", err) }
	logActivity(h.DB, link.NetworkID, userID, "member_joined", map[string]interface{}{"via": "invite_link"})
	h.Broker.PublishToNetwork(link.NetworkID, "peers", sse.Event{Type: "member_joined", Payload: map[string]string{"network_id": link.NetworkID}})
	jsonOK(w, http.StatusOK, map[string]string{"network_id": link.NetworkID})
}
