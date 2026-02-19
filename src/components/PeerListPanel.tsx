import { useState } from "react";
import { Users, RefreshCw, Loader2, Wifi, Clock, Trash2 } from "lucide-react";
import { getPeers, removePeer, type Peer } from "@/lib/api";

interface PeerListPanelProps {
  networkId: string | null;
  peers: Peer[];
  onRefresh: (peers: Peer[]) => void;
  isOwner?: boolean;
}

function getPeerStatus(lastSeen?: string): "online" | "stale" | "offline" {
  if (!lastSeen) return "offline";
  const elapsed = Date.now() - new Date(lastSeen).getTime();
  if (elapsed < 30_000) return "online";
  if (elapsed < 60_000) return "stale";
  return "offline";
}

function StatusDot({ status }: { status: "online" | "stale" | "offline" }) {
  const colors = {
    online: "bg-primary animate-pulse-glow",
    stale: "bg-accent",
    offline: "bg-destructive",
  };
  const labels = { online: "online", stale: "stale", offline: "offline" };

  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />
      <span className="text-muted-foreground uppercase text-[10px]">{labels[status]}</span>
    </span>
  );
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "never";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function PeerListPanel({ networkId, peers, onRefresh, isOwner }: PeerListPanelProps) {
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleRefresh = async () => {
    if (!networkId) return;
    setLoading(true);
    try {
      const result = await getPeers(networkId);
      onRefresh(result);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (virtualIp: string) => {
    setRemoving(virtualIp);
    try {
      await removePeer(virtualIp);
      if (networkId) {
        const result = await getPeers(networkId);
        onRefresh(result);
      }
    } catch {
      // silent
    } finally {
      setRemoving(null);
    }
  };

  const onlineCount = peers.filter((p) => getPeerStatus(p.last_seen) === "online").length;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Peers
          </h2>
          <span className="text-xs text-muted-foreground">
            ({onlineCount}/{peers.length} online)
          </span>
        </div>
        {networkId && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {!networkId ? (
        <p className="text-xs text-muted-foreground">
          Create or join a network to see peers.
        </p>
      ) : peers.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No peers yet. Share the network ID to invite others.
        </p>
      ) : (
        <div className="space-y-2">
          {peers.map((peer, i) => {
            const status = getPeerStatus(peer.last_seen);
            return (
              <div
                key={i}
                className="p-3 rounded-md bg-muted border border-border text-xs font-mono"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-primary">{peer.virtual_ip}</span>
                  <div className="flex items-center gap-2">
                    <StatusDot status={status} />
                    {isOwner && (
                      <button
                        onClick={() => handleRemove(peer.virtual_ip)}
                        disabled={removing === peer.virtual_ip}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove peer"
                      >
                        {removing === peer.virtual_ip ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-muted-foreground">{peer.endpoint}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeAgo(peer.last_seen)}
                  </span>
                </div>
                <div className="text-muted-foreground truncate">
                  pubkey: {peer.public_key.slice(0, 20)}...
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
