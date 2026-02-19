import { useState, useEffect } from "react";
import { Network, Trash2, Loader2, Users, AlertTriangle } from "lucide-react";
import { getNetworks, deleteNetwork, getPeers, type NetworkInfo } from "@/lib/api";

interface NetworkListPanelProps {
  refreshKey: number;
  activeNetwork: string | null;
  onSelect: (id: string) => void;
  onNetworksLoaded?: (networks: NetworkInfo[]) => void;
}

export function NetworkListPanel({ refreshKey, activeNetwork, onSelect, onNetworksLoaded }: NetworkListPanelProps) {
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);
  const [peerCounts, setPeerCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchNetworks = async () => {
    setLoading(true);
    try {
      const data = await getNetworks();
      setNetworks(data);
      onNetworksLoaded?.(data);
      const counts: Record<string, number> = {};
      await Promise.allSettled(
        data.map(async (net) => {
          try {
            const peers = await getPeers(net.id);
            counts[net.id] = peers.length;
          } catch {
            counts[net.id] = 0;
          }
        })
      );
      setPeerCounts(counts);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNetworks();
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    setDeleting(id);
    setConfirmDelete(null);
    try {
      await deleteNetwork(id);
      setNetworks((prev) => prev.filter((n) => n.id !== id));
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  };

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = setTimeout(() => setConfirmDelete(null), 3000);
    return () => clearTimeout(timer);
  }, [confirmDelete]);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Network className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          My Networks
        </h2>
        <span className="text-xs text-muted-foreground">({networks.length})</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : networks.length === 0 ? (
        <p className="text-xs text-muted-foreground">No networks yet. Create one above.</p>
      ) : (
        <div className="space-y-2">
          {networks.map((net) => (
            <div
              key={net.id}
              className={`p-3 rounded-md border text-xs font-mono cursor-pointer transition-colors ${
                activeNetwork === net.id
                  ? "bg-secondary border-primary"
                  : "bg-muted border-border hover:border-primary/50"
              }`}
              onClick={() => onSelect(net.id)}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  {net.name ? (
                    <span className="text-foreground font-semibold truncate block">{net.name}</span>
                  ) : null}
                  <span className="text-primary truncate block">{net.id.slice(0, 16)}...</span>
                  {net.description && (
                    <span className="text-muted-foreground block mt-0.5">{net.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2 shrink-0">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {peerCounts[net.id] ?? "–"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(net.id);
                    }}
                    disabled={deleting === net.id}
                    className={`transition-colors ${
                      confirmDelete === net.id
                        ? "text-destructive"
                        : "text-muted-foreground hover:text-destructive"
                    }`}
                    title={confirmDelete === net.id ? "Click again to confirm" : "Delete network"}
                  >
                    {deleting === net.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : confirmDelete === net.id ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>
              <div className="text-muted-foreground mt-1">
                created: {new Date(net.created_at).toLocaleString()}
              </div>
              {confirmDelete === net.id && (
                <div className="text-destructive mt-1 text-[10px] uppercase tracking-wider">
                  Click delete again to confirm
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
