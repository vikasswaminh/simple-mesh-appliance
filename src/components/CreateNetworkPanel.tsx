import { useState } from "react";
import { Plus, Loader2, Copy, Check } from "lucide-react";
import { createNetwork } from "@/lib/api";

interface CreateNetworkPanelProps {
  onCreated: (networkId: string) => void;
}

export function CreateNetworkPanel({ onCreated }: CreateNetworkPanelProps) {
  const [loading, setLoading] = useState(false);
  const [networkId, setNetworkId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await createNetwork(name.trim() || undefined, description.trim() || undefined);
      setNetworkId(id);
      setName("");
      setDescription("");
      onCreated(id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyId = () => {
    if (networkId) {
      navigator.clipboard.writeText(networkId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Plus className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Create Network
        </h2>
      </div>

      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My VPN Network"
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Home lab mesh network"
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 glow-primary"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {loading ? "Creating..." : "New Network"}
      </button>

      {error && (
        <p className="text-xs text-destructive mt-3">{error}</p>
      )}

      {networkId && (
        <div className="mt-4 p-3 rounded-md bg-muted border border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">network_id</span>
            <button onClick={copyId} className="text-muted-foreground hover:text-primary transition-colors">
              {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
          <p className="text-xs text-primary mt-1 font-mono break-all">{networkId}</p>
        </div>
      )}
    </div>
  );
}
