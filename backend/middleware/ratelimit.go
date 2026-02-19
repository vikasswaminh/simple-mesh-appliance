package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"
)

type tokenBucket struct {
	tokens   float64
	lastTime time.Time
	mu       sync.Mutex
}

type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*tokenBucket
	rate    float64
	burst   float64
}

func newRateLimiter(ratePerSec, burst float64) *rateLimiter {
	rl := &rateLimiter{
		buckets: make(map[string]*tokenBucket),
		rate:    ratePerSec,
		burst:   burst,
	}
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			rl.cleanup()
		}
	}()
	return rl
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	b, ok := rl.buckets[ip]
	if !ok {
		b = &tokenBucket{tokens: rl.burst, lastTime: time.Now()}
		rl.buckets[ip] = b
	}
	rl.mu.Unlock()

	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(b.lastTime).Seconds()
	b.tokens += elapsed * rl.rate
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.lastTime = now
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

func (rl *rateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	cutoff := time.Now().Add(-10 * time.Minute)
	for ip, b := range rl.buckets {
		b.mu.Lock()
		old := b.lastTime.Before(cutoff)
		b.mu.Unlock()
		if old {
			delete(rl.buckets, ip)
		}
	}
}

var globalLimiter = newRateLimiter(10, 20)

// RateLimit enforces per-IP rate limiting (10 req/s, burst 20).
func RateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := realIP(r)
		if !globalLimiter.allow(ip) {
			http.Error(w, "{\"error\":\"rate limit exceeded\"}", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func realIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	addr := r.RemoteAddr
	if idx := strings.LastIndex(addr, ":"); idx != -1 {
		return addr[:idx]
	}
	return addr
}
