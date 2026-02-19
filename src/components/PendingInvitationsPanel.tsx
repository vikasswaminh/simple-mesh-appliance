import { useState, useEffect } from "react";
import { Inbox, Loader2, Check, X } from "lucide-react";
import { getPendingInvitations, acceptInvitation } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface Invitation {
  id: string;
  network_id: string;
  invited_email: string;
  invited_by: string;
  status: string;
  created_at: string;
}

interface PendingInvitationsPanelProps {
  onAccepted: (networkId: string) => void;
}

export function PendingInvitationsPanel({ onAccepted }: PendingInvitationsPanelProps) {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  const fetchInvitations = async () => {
    if (!user) return;
    try {
      const data = await getPendingInvitations();
      setInvitations(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
    // Poll every 30s for new invitations
    const interval = setInterval(fetchInvitations, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleAction = async (invitationId: string, action: "accept" | "decline") => {
    setProcessing(invitationId);
    try {
      const data = await acceptInvitation(invitationId, action);
      setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      if (action === "accept" && data.network_id) {
        onAccepted(data.network_id);
      }
    } catch {
      // silent
    } finally {
      setProcessing(null);
    }
  };

  if (loading || invitations.length === 0) return null;

  return (
    <div className="rounded-lg border border-accent/30 bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Inbox className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Pending Invitations
        </h2>
        <span className="text-xs text-accent">({invitations.length})</span>
      </div>

      <div className="space-y-2">
        {invitations.map((inv) => (
          <div
            key={inv.id}
            className="p-3 rounded-md bg-muted border border-border text-xs font-mono flex items-center justify-between"
          >
            <div>
              <span className="text-primary">{inv.network_id.slice(0, 8)}...</span>
              <span className="text-muted-foreground ml-2">
                {new Date(inv.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {processing === inv.id ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <button
                    onClick={() => handleAction(inv.id, "accept")}
                    className="p-1.5 rounded bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                    title="Accept"
                  >
                    <Check className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleAction(inv.id, "decline")}
                    className="p-1.5 rounded bg-destructive/20 text-destructive hover:bg-destructive/30 transition-colors"
                    title="Decline"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
