package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/wgcloudctrl/server/sse"
	mw "github.com/wgcloudctrl/server/middleware"
)

type NetworksHandler struct {
	DB     *sql.DB
	Broker *sse.Broker
}

type Network struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

// POST /api/networks/create
func (h *NetworksHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	if req.Name == "" { req.Name = "My Network" }
	var netID string
	err := h.DB.QueryRowContext(r.Context(),
		"INSERT INTO networks (owner_id, name, description) VALUES ($1, $2, $3) RETURNING id",
		userID, req.Name, req.Description,
	).Scan(&netID)
	if err != nil { log.Printf("create network error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	_, err = h.DB.ExecContext(r.Context(),
		"INSERT INTO network_members (network_id, user_id, role) VALUES ($1, $2, 'owner')",
		netID, userID)
	if err != nil { log.Printf("add owner member error: %v", err) }
	logActivity(h.DB, netID, userID, "network_created", map[string]interface{}{})
	jsonOK(w, http.StatusCreated, map[string]string{"network_id": netID})
}

// GET /api/networks
func (h *NetworksHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	rows, err := h.DB.QueryContext(r.Context(),
		"SELECT n.id, n.name, n.description, n.created_at FROM networks n JOIN network_members nm ON nm.network_id = n.id WHERE nm.user_id = $1 ORDER BY n.created_at DESC",
		userID)
	if err != nil { log.Printf("list networks error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	defer rows.Close()
	var nets []Network
	for rows.Next() {
		var n Network
		if err := rows.Scan(&n.ID, &n.Name, &n.Description, &n.CreatedAt); err != nil {
			log.Printf("scan network error: %v", err)
			continue
		}
		nets = append(nets, n)
	}
	if nets == nil { nets = []Network{} }
	jsonOK(w, http.StatusOK, nets)
}

// PATCH /api/networks/:id
func (h *NetworksHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	netID := mux.Vars(r)["id"]
	var req struct { Name string `json:"name"`; Description string `json:"description"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	res, err := h.DB.ExecContext(r.Context(),
		"UPDATE networks SET name = $1, description = $2 WHERE id = $3 AND owner_id = $4",
		req.Name, req.Description, netID, userID)
	if err != nil { log.Printf("update network error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	n, _ := res.RowsAffected()
	if n == 0 { jsonError(w, "network not found or not owner", http.StatusNotFound); return }
	jsonOK(w, http.StatusOK, map[string]string{"message": "updated"})
}

// DELETE /api/networks/:id
func (h *NetworksHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	netID := mux.Vars(r)["id"]
	res, err := h.DB.ExecContext(r.Context(),
		"DELETE FROM networks WHERE id = $1 AND owner_id = $2", netID, userID)
	if err != nil { log.Printf("delete network error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	n, _ := res.RowsAffected()
	if n == 0 { jsonError(w, "network not found or not owner", http.StatusNotFound); return }
	jsonOK(w, http.StatusOK, map[string]string{"message": "deleted"})
}
