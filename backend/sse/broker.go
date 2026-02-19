package sse

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
)

type Event struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type client struct {
	send   chan Event
	topics []string
}

type Broker struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
}

func NewBroker() *Broker {
	return &Broker{clients: make(map[*client]struct{})}
}

func (b *Broker) Subscribe(w http.ResponseWriter, r *http.Request, topics ...string) {
	flusher, ok := w.(http.Flusher)
	if !ok { http.Error(w, "streaming not supported", http.StatusInternalServerError); return }
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	c := &client{send: make(chan Event, 64), topics: topics}

	b.mu.Lock()
	b.clients[c] = struct{}{}
	b.mu.Unlock()

	defer func() {
		b.mu.Lock()
		delete(b.clients, c)
		b.mu.Unlock()
		close(c.send)
	}()

	fmt.Fprintf(w, "event: ping\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case evt, open := <-c.send:
			if !open { return }
			data, err := json.Marshal(evt)
			if err != nil { continue }
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Type, data)
			flusher.Flush()
		}
	}
}

func (b *Broker) Publish(topic string, evt Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for c := range b.clients {
		for _, t := range c.topics {
			if t == topic {
				select {
				case c.send <- evt:
				default:
				}
				break
			}
		}
	}
}

func (b *Broker) PublishToUser(userID string, evt Event) {
	b.Publish("user:"+userID, evt)
}

func (b *Broker) PublishToNetwork(networkID, suffix string, evt Event) {
	b.Publish(suffix+":"+networkID, evt)
}
