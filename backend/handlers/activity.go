package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/wgcloudctrl/server/sse"
	mw "github.com/wgcloudctrl/server/middleware"
)

// ActivityLog represents a single activity entry.
type ActivityLog struct {
	ID        string          `json:"id"`
	NetworkID string          `json:"network_id"`
	UserID    *string         `json:"user_id"`
	Action    string          `json:"event_type"`
	Details   json.RawMessage `json:"metadata"`
	CreatedAt time.Time       `json:"created_at"`
}

type ActivityHandler struct {
	DB     *sql.DB
	Broker *sse.Broker
}

// logActivity writes an activity log entry and publishes it via SSE.
func logActivity(db *sql.DB, networkID, userID, eventType string, meta map[string]interface{}) {
	metaJSON, _ := json.Marshal(meta)
	var uid interface{}
	if userID != "" { uid = userID }
	_, err := db.Exec(
		"INSERT INTO network_activity_logs (network_id, user_id, event_type, metadata) VALUES ($1, $2, $3, $4)",
		networkID, uid, eventType, string(metaJSON))
	if err != nil { log.Printf("logActivity error: %v", err) }
}

// GET /api/activity?network_id=X&limit=50
func (h *ActivityHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	networkID := r.URL.Query().Get("network_id")
	if networkID == "" { jsonError(w, "network_id is required", http.StatusBadRequest); return }
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" { if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 200 { limit = l } }
	var memberCheck int
	err := h.DB.QueryRowContext(r.Context(), "SELECT 1 FROM network_members WHERE network_id = $1 AND user_id = $2", networkID, userID).Scan(&memberCheck)
	if err == sql.ErrNoRows { jsonError(w, "not a member of this network", http.StatusForbidden); return }
	if err != nil { log.Printf("member check error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	rows, err := h.DB.QueryContext(r.Context(),
		"SELECT id, network_id, user_id, event_type, metadata, created_at FROM network_activity_logs WHERE network_id = $1 ORDER BY created_at DESC LIMIT $2",
		networkID, limit)
	if err != nil { log.Printf("activity list error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	defer rows.Close()
	var logs []ActivityLog
	for rows.Next() {
		var a ActivityLog
		var meta []byte
		if err := rows.Scan(&a.ID, &a.NetworkID, &a.UserID, &a.Action, &meta, &a.CreatedAt); err != nil {
			log.Printf("scan activity error: %v", err)
			continue
		}
		a.Details = json.RawMessage(meta)
		logs = append(logs, a)
	}
	if logs == nil { logs = []ActivityLog{} }
	jsonOK(w, http.StatusOK, logs)
}
