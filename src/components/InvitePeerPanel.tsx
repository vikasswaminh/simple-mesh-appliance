import { useState } from "react";
import { Mail, Loader2, Send, Check, X } from "lucide-react";
import { createInvitation } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface InvitePeerPanelProps {
  networkId: string | null;
}

export function InvitePeerPanel({ networkId }: InvitePeerPanelProps) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleInvite = async () => {
    if (!networkId || !email.trim() || !user) return;

    if (email.trim() === user.email) {
      setError("Cannot invite yourself");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await createInvitation(networkId, email.trim().toLowerCase());
      setSuccess(true);
      setEmail("");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!networkId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Mail className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Invite to Network
        </h2>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        Invite users by email to join this network. They'll see the invitation when they log in.
      </p>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="user@example.com"
          className="flex-1 px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          onKeyDown={(e) => e.key === "Enter" && handleInvite()}
        />
        <button
          onClick={handleInvite}
          disabled={loading || !email.trim()}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : success ? (
            <Check className="h-4 w-4" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
      {success && <p className="text-xs text-primary mt-2">Invitation sent!</p>}
    </div>
  );
}
