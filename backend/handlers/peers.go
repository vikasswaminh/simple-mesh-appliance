package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/mux"
	"github.com/wgcloudctrl/server/sse"
	mw "github.com/wgcloudctrl/server/middleware"
)

type PeersHandler struct { DB *sql.DB; Broker *sse.Broker }

type Peer struct {
	ID        string     `json:"id"`
	NetworkID string     `json:"network_id"`
	UserID    string     `json:"user_id"`
	PublicKey string     `json:"public_key"`
	Endpoint  string     `json:"endpoint"`
	VirtualIP string     `json:"virtual_ip"`
	LastSeen  *time.Time `json:"last_seen"`
	CreatedAt time.Time  `json:"created_at"`
}

func nextVirtualIP(db *sql.DB, networkID string) (string, error) {
	rows, err := db.Query("SELECT virtual_ip FROM peers WHERE network_id = $1", networkID)
	if err != nil { return "", fmt.Errorf("query peers: %w", err) }
	defer rows.Close()
	used := make(map[string]bool)
	for rows.Next() { var ip string; if err := rows.Scan(&ip); err == nil { used[ip] = true } }
	for i := 2; i <= 254; i++ { ip := fmt.Sprintf("10.10.0.%d", i); if !used[ip] { return ip, nil } }
	return "", fmt.Errorf("no available IP addresses in 10.10.0.0/24")
}

func getPeers(db *sql.DB, networkID string) ([]Peer, error) {
	rows, err := db.Query("SELECT id, network_id, user_id, public_key, endpoint, virtual_ip, last_seen, created_at FROM peers WHERE network_id = $1 ORDER BY created_at", networkID)
	if err != nil { return nil, err }
	defer rows.Close()
	var peers []Peer
	for rows.Next() {
		var p Peer
		if err := rows.Scan(&p.ID, &p.NetworkID, &p.UserID, &p.PublicKey, &p.Endpoint, &p.VirtualIP, &p.LastSeen, &p.CreatedAt); err != nil { continue }
		peers = append(peers, p)
	}
	if peers == nil { peers = []Peer{} }
	return peers, nil
}
func (h *PeersHandler) Join(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	var req struct { NetworkID string `json:"network_id"`; PublicKey string `json:"public_key"`; Endpoint string `json:"endpoint"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil { jsonError(w, "invalid request body", http.StatusBadRequest); return }
	if req.NetworkID == "" || req.PublicKey == "" { jsonError(w, "network_id and public_key are required", http.StatusBadRequest); return }
	var mc int
	err := h.DB.QueryRowContext(r.Context(), "SELECT 1 FROM network_members WHERE network_id = $1 AND user_id = $2", req.NetworkID, userID).Scan(&mc)
	if err == sql.ErrNoRows { jsonError(w, "not a member of this network", http.StatusForbidden); return }
	if err != nil { log.Printf("member check error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	vip, err := nextVirtualIP(h.DB, req.NetworkID)
	if err != nil { log.Printf("nextVirtualIP error: %v", err); jsonError(w, "no available IPs", http.StatusConflict); return }
	var peerID string
	err = h.DB.QueryRowContext(r.Context(),
		"INSERT INTO peers (network_id, user_id, public_key, endpoint, virtual_ip) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (network_id, public_key) DO UPDATE SET endpoint=EXCLUDED.endpoint, last_seen=NOW() RETURNING id, virtual_ip",
		req.NetworkID, userID, req.PublicKey, req.Endpoint, vip).Scan(&peerID, &vip)
	if err != nil { log.Printf("peer upsert error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	peers, err := getPeers(h.DB, req.NetworkID)
	if err != nil { log.Printf("get peers error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	logActivity(h.DB, req.NetworkID, userID, "peer_joined", map[string]interface{}{"public_key": req.PublicKey, "virtual_ip": vip})
	h.Broker.PublishToNetwork(req.NetworkID, "peers", sse.Event{Type: "peer_joined", Payload: peers})
	jsonOK(w, http.StatusOK, map[string]interface{}{"virtual_ip": vip, "peers": peers})
}

func (h *PeersHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	networkID := r.URL.Query().Get("network_id")
	if networkID == "" { jsonError(w, "network_id is required", http.StatusBadRequest); return }
	var mc int
	err := h.DB.QueryRowContext(r.Context(), "SELECT 1 FROM network_members WHERE network_id = $1 AND user_id = $2", networkID, userID).Scan(&mc)
	if err == sql.ErrNoRows { jsonError(w, "not a member of this network", http.StatusForbidden); return }
	if err != nil { log.Printf("member check error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	peers, err := getPeers(h.DB, networkID)
	if err != nil { log.Printf("get peers error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	jsonOK(w, http.StatusOK, map[string]interface{}{"peers": peers})
}

func (h *PeersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	peerID := mux.Vars(r)["id"]
	var networkID string
	err := h.DB.QueryRowContext(r.Context(), "SELECT network_id FROM peers WHERE id = $1", peerID).Scan(&networkID)
	if err == sql.ErrNoRows { jsonError(w, "peer not found", http.StatusNotFound); return }
	if err != nil { log.Printf("peer query error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	_, err = h.DB.ExecContext(r.Context(), "DELETE FROM peers WHERE id = $1", peerID)
	if err != nil { log.Printf("delete peer error: %v", err); jsonError(w, "internal error", http.StatusInternalServerError); return }
	logActivity(h.DB, networkID, userID, "peer_left", map[string]interface{}{"peer_id": peerID})
	ps, _ := getPeers(h.DB, networkID)
	h.Broker.PublishToNetwork(networkID, "peers", sse.Event{Type: "peer_left", Payload: ps})
	jsonOK(w, http.StatusOK, map[string]string{"message": "peer removed"})
}
