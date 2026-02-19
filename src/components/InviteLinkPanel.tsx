import { useState, useEffect } from "react";
import { Link2, Loader2, Copy, Check, Trash2, Plus } from "lucide-react";
import { createInviteLink, getInviteLinks, deleteInviteLink, type InviteLink } from "@/lib/api";

interface InviteLinkPanelProps {
  networkId: string | null;
}

export function InviteLinkPanel({ networkId }: InviteLinkPanelProps) {
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!networkId) return;
    setLoading(true);
    getInviteLinks(networkId).then(setLinks).catch(() => {}).finally(() => setLoading(false));
  }, [networkId]);

  const handleCreate = async () => {
    if (!networkId) return;
    setCreating(true);
    try {
      const link = await createInviteLink(networkId);
      setLinks((prev) => [link, ...prev]);
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (token: string) => {
    const url = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(url);
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInviteLink(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch {
      // silent
    }
  };

  if (!networkId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Invite Links
          </h2>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
        >
          {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          New Link
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : links.length === 0 ? (
        <p className="text-xs text-muted-foreground">No invite links. Create one to share.</p>
      ) : (
        <div className="space-y-2">
          {links.map((link) => {
            const expired = new Date(link.expires_at) < new Date();
            const exhausted = link.max_uses !== null && link.use_count >= link.max_uses;
            return (
              <div key={link.id} className={`p-3 rounded-md bg-muted border border-border text-xs font-mono ${expired || exhausted ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-primary truncate">/join/{link.token.slice(0, 12)}...</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => handleCopy(link.token)} className="text-muted-foreground hover:text-primary transition-colors">
                      {copied === link.token ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
                    </button>
                    <button onClick={() => handleDelete(link.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 text-muted-foreground mt-1">
                  <span>uses: {link.use_count}{link.max_uses !== null ? `/${link.max_uses}` : ""}</span>
                  <span>{expired ? "expired" : `expires: ${new Date(link.expires_at).toLocaleDateString()}`}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
