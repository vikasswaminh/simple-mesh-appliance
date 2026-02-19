package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/wgcloudctrl/server/sse"
	mw "github.com/wgcloudctrl/server/middleware"
)

type InvitationsHandler struct { DB *sql.DB; Broker *sse.Broker }

type Invitation struct {
	ID            string    `json:"id"`
	NetworkID     string    `json:"network_id"`
	InvitedBy     string    `json:"invited_by"`
	InvitedEmail  string    `json:"invited_email"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
}

func (h *InvitationsHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	var req struct { NetworkID string `json:"network_id"`; InvitedEmail string `json:"invited_email"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	req.InvitedEmail = strings.ToLower(strings.TrimSpace(req.InvitedEmail))
	if req.NetworkID == "" || req.InvitedEmail == "" { jsonError(w, "network_id and invited_email are required", http.StatusBadRequest); return }
	var mc int
	err := h.DB.QueryRowContext(r.Context(), "SELECT 1 FROM network_members WHERE network_id = $1 AND user_id = $2", req.NetworkID, userID).Scan(&mc)
	if err == sql.ErrNoRows { jsonError(w, "not a member of this network", http.StatusForbidden); return }
	if err != nil { jsonError(w, "internal error", http.StatusInternalServerError); return }
	var invID string
	err = h.DB.QueryRowContext(r.Context(), "INSERT INTO invitations (network_id, invited_by, invited_email) VALUES ($1, $2, $3) RETURNING id", req.NetworkID, userID, req.InvitedEmail).Scan(&invID)
	if err != nil { log.Printf("create invitation error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	var invitedUserID string
	_ = h.DB.QueryRowContext(r.Context(), "SELECT id FROM users WHERE email = $1", req.InvitedEmail).Scan(&invitedUserID)
	if invitedUserID != "" {
		h.Broker.PublishToUser(invitedUserID, sse.Event{Type: "invitation_received", Payload: map[string]string{"invitation_id": invID, "network_id": req.NetworkID}})
	}
	logActivity(h.DB, req.NetworkID, userID, "invitation_sent", map[string]interface{}{"invited_email": req.InvitedEmail})
	jsonOK(w, http.StatusCreated, map[string]string{"invitation_id": invID})
}

func (h *InvitationsHandler) Pending(w http.ResponseWriter, r *http.Request) {
	email := mw.EmailFromContext(r.Context())
	rows, err := h.DB.QueryContext(r.Context(),
		"SELECT id, network_id, invited_by, invited_email, status, created_at FROM invitations WHERE invited_email = $1 AND status = 'pending' ORDER BY created_at DESC",
		email)
	if err != nil { log.Printf("pending invitations error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	defer rows.Close()
	var invs []Invitation
	for rows.Next() {
		var inv Invitation
		if err := rows.Scan(&inv.ID, &inv.NetworkID, &inv.InvitedBy, &inv.InvitedEmail, &inv.Status, &inv.CreatedAt); err != nil { continue }
		invs = append(invs, inv)
	}
	if invs == nil { invs = []Invitation{} }
	jsonOK(w, http.StatusOK, invs)
}

func (h *InvitationsHandler) Accept(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	email := mw.EmailFromContext(r.Context())
	var req struct { InvitationID string `json:"invitation_id"`; Action string `json:"action"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	if req.InvitationID == "" { jsonError(w, "invitation_id is required", http.StatusBadRequest); return }
	var inv Invitation
	err := h.DB.QueryRowContext(r.Context(), "SELECT id, network_id, invited_email, status FROM invitations WHERE id = $1", req.InvitationID).Scan(&inv.ID, &inv.NetworkID, &inv.InvitedEmail, &inv.Status)
	if err == sql.ErrNoRows { jsonError(w, "invitation not found", http.StatusNotFound); return }
	if err != nil { log.Printf("invitation query error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	if inv.InvitedEmail != email { jsonError(w, "this invitation is not for you", http.StatusForbidden); return }
	if inv.Status != "pending" { jsonError(w, "invitation is no longer pending", http.StatusConflict); return }
	newStatus := "declined"
	if req.Action == "accept" || req.Action == "" { newStatus = "accepted" }
	_, err = h.DB.ExecContext(r.Context(), "UPDATE invitations SET status = $1, updated_at = NOW() WHERE id = $2", newStatus, req.InvitationID)
	if err != nil { log.Printf("update invitation error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	if newStatus == "accepted" {
		_, err = h.DB.ExecContext(r.Context(), "INSERT INTO network_members (network_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (network_id, user_id) DO NOTHING", inv.NetworkID, userID)
		if err != nil { log.Printf("add member error: %v", err) }
		logActivity(h.DB, inv.NetworkID, userID, "invitation_accepted", map[string]interface{}{"invited_email": email})
		jsonOK(w, http.StatusOK, map[string]string{"network_id": inv.NetworkID})
	} else {
		jsonOK(w, http.StatusOK, map[string]string{"message": "invitation declined"})
	}
}
