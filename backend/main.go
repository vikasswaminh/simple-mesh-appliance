package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/wgcloudctrl/server/config"
	dbpkg "github.com/wgcloudctrl/server/db"
	"github.com/wgcloudctrl/server/handlers"
	"github.com/wgcloudctrl/server/middleware"
	"github.com/wgcloudctrl/server/sse"
)

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.LUTC | log.Lshortfile)

	cfg, err := config.Load()
	if err != nil { log.Fatalf("config: %v", err) }

	db, err := dbpkg.Open(cfg.DBURL)
	if err != nil { log.Fatalf("database: %v", err) }
	defer db.Close()

	if err := dbpkg.Migrate(db); err != nil { log.Fatalf("migrate: %v", err) }

	middleware.SetJWTSecret(cfg.JWTSecret)

	broker := sse.NewBroker()

	authH  := &handlers.AuthHandler{DB: db, Cfg: cfg}
	netsH  := &handlers.NetworksHandler{DB: db, Broker: broker}
	peersH := &handlers.PeersHandler{DB: db, Broker: broker}
	mbH    := &handlers.MembersHandler{DB: db, Broker: broker}
	invH   := &handlers.InvitationsHandler{DB: db, Broker: broker}
	ilH    := &handlers.InviteLinksHandler{DB: db, Broker: broker}
	actH   := &handlers.ActivityHandler{DB: db, Broker: broker}
	sseH   := &handlers.SSEHandler{Broker: broker}

	r := mux.NewRouter()
	r.Use(middleware.CORS)
	r.Use(middleware.RateLimit)
	r.Use(jsonLogging)

	r.HandleFunc("/healthz", healthz).Methods("GET", "OPTIONS")

	api := r.PathPrefix("/api").Subrouter()

	api.HandleFunc("/auth/signup",         authH.Signup).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/signin",         authH.Signin).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/signout",        authH.Signout).Methods("POST", "OPTIONS")
	api.HandleFunc("/auth/reset-password", authH.ResetPassword).Methods("POST", "OPTIONS")

	auth := api.NewRoute().Subrouter()
	auth.Use(middleware.Auth)
	auth.HandleFunc("/auth/update-password", authH.UpdatePassword).Methods("POST", "OPTIONS")
	auth.HandleFunc("/auth/me",              authH.Me).Methods("GET", "OPTIONS")

	auth.HandleFunc("/networks/create",          netsH.Create).Methods("POST", "OPTIONS")
	auth.HandleFunc("/networks",                 netsH.List).Methods("GET", "OPTIONS")
	auth.HandleFunc("/networks/{id}",            netsH.Update).Methods("PATCH", "OPTIONS")
	auth.HandleFunc("/networks/{id}",            netsH.Delete).Methods("DELETE", "OPTIONS")

	auth.HandleFunc("/peers/join",  peersH.Join).Methods("POST", "OPTIONS")
	auth.HandleFunc("/peers",       peersH.List).Methods("GET", "OPTIONS")
	auth.HandleFunc("/peers/{id}",  peersH.Delete).Methods("DELETE", "OPTIONS")

	auth.HandleFunc("/networks/{id}/members", mbH.List).Methods("GET", "OPTIONS")
	auth.HandleFunc("/members/{id}",          mbH.Delete).Methods("DELETE", "OPTIONS")

	auth.HandleFunc("/invitations",         invH.Create).Methods("POST", "OPTIONS")
	auth.HandleFunc("/invitations/pending", invH.Pending).Methods("GET", "OPTIONS")
	auth.HandleFunc("/invitations/accept",  invH.Accept).Methods("POST", "OPTIONS")

	auth.HandleFunc("/invite-links",      ilH.Create).Methods("POST", "OPTIONS")
	auth.HandleFunc("/invite-links",      ilH.List).Methods("GET", "OPTIONS")
	auth.HandleFunc("/invite-links/{id}", ilH.Delete).Methods("DELETE", "OPTIONS")
	auth.HandleFunc("/invite-links/join", ilH.JoinByToken).Methods("POST", "OPTIONS")

	auth.HandleFunc("/activity", actH.List).Methods("GET", "OPTIONS")

	auth.HandleFunc("/sse/peers",       sseH.Peers).Methods("GET")
	auth.HandleFunc("/sse/invitations", sseH.Invitations).Methods("GET")
	auth.HandleFunc("/sse/activity",    sseH.Activity).Methods("GET")

	srv := &http.Server{
		Addr:         ":"+cfg.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	<-quit
	log.Println("shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil { log.Printf("shutdown error: %v", err) }
	log.Println("shutdown complete")
}

func healthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// jsonLogging logs each request as a JSON line.
func jsonLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		log.Printf(
			"method=%s path=%s status=%d duration_ms=%d",
			r.Method, r.URL.Path, rw.status, time.Since(start).Milliseconds())
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
}

func (rw *responseWriter) WriteHeader(code int) {
	if !rw.wrote { rw.status = code; rw.wrote = true; rw.ResponseWriter.WriteHeader(code) }
}
