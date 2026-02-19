package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/wgcloudctrl/server/sse"
	mw "github.com/wgcloudctrl/server/middleware"
)

type MembersHandler struct { DB *sql.DB; Broker *sse.Broker }

type Member struct {
	ID        string    `json:"id"`
	NetworkID string    `json:"network_id"`
	UserID    string    `json:"user_id"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
	Email     string    `json:"email"`
}

func (h *MembersHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	netID := mux.Vars(r)["id"]
	var mc int
	err := h.DB.QueryRowContext(r.Context(), "SELECT 1 FROM network_members WHERE network_id = $1 AND user_id = $2", netID, userID).Scan(&mc)
	if err == sql.ErrNoRows { jsonError(w, "not a member of this network", http.StatusForbidden); return }
	if err != nil { log.Printf("member check error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	rows, err := h.DB.QueryContext(r.Context(),
		"SELECT nm.id, nm.network_id, nm.user_id, nm.role, nm.created_at, u.email FROM network_members nm JOIN users u ON u.id = nm.user_id WHERE nm.network_id = $1 ORDER BY nm.created_at",
		netID)
	if err != nil { log.Printf("list members error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	defer rows.Close()
	var members []Member
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.ID, &m.NetworkID, &m.UserID, &m.Role, &m.CreatedAt, &m.Email); err != nil { log.Printf("scan member error: %v", err); continue }
		members = append(members, m)
	}
	if members == nil { members = []Member{} }
	jsonOK(w, http.StatusOK, members)
}

func (h *MembersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	requesterID := mw.UserIDFromContext(r.Context())
	memberID := mux.Vars(r)["id"]
	var networkID, targetUserID, targetRole string
	err := h.DB.QueryRowContext(r.Context(), "SELECT network_id, user_id, role FROM network_members WHERE id = $1", memberID).Scan(&networkID, &targetUserID, &targetRole)
	if err == sql.ErrNoRows { jsonError(w, "member not found", http.StatusNotFound); return }
	if err != nil { log.Printf("member query error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	var requesterRole string
	err = h.DB.QueryRowContext(r.Context(), "SELECT role FROM network_members WHERE network_id = $1 AND user_id = $2", networkID, requesterID).Scan(&requesterRole)
	if err == sql.ErrNoRows { jsonError(w, "you are not a member of this network", http.StatusForbidden); return }
	if requesterID != targetUserID && requesterRole != "owner" && requesterRole != "admin" { jsonError(w, "not authorized to remove this member", http.StatusForbidden); return }
	if targetRole == "owner" { jsonError(w, "cannot remove network owner", http.StatusForbidden); return }
	_, err = h.DB.ExecContext(r.Context(), "DELETE FROM network_members WHERE id = $1", memberID)
	if err != nil { log.Printf("delete member error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	logActivity(h.DB, networkID, requesterID, "member_removed", map[string]interface{}{"removed_user_id": targetUserID})
	jsonOK(w, http.StatusOK, map[string]string{"message": "member removed"})
}
