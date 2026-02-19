package handlers

import (
	"net/http"

	"github.com/wgcloudctrl/server/sse"
	mw "github.com/wgcloudctrl/server/middleware"
)

type SSEHandler struct { Broker *sse.Broker }

// GET /api/sse/peers?network_id=X
func (h *SSEHandler) Peers(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	networkID := r.URL.Query().Get("network_id")
	if networkID == "" { http.Error(w, "network_id required", http.StatusBadRequest); return }
	_ = userID
	h.Broker.Subscribe(w, r, "peers:"+networkID)
}

// GET /api/sse/invitations
func (h *SSEHandler) Invitations(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	h.Broker.Subscribe(w, r, "user:"+userID)
}

// GET /api/sse/activity?network_id=X
func (h *SSEHandler) Activity(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	networkID := r.URL.Query().Get("network_id")
	if networkID == "" { http.Error(w, "network_id required", http.StatusBadRequest); return }
	_ = userID
	h.Broker.Subscribe(w, r, "activity:"+networkID)
}
