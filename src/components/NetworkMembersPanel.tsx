import { useState, useEffect } from "react";
import { Users, Loader2, Trash2, Crown, User } from "lucide-react";
import { getNetworkMembers, removeMember, type NetworkMember } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

interface NetworkMembersPanelProps {
  networkId: string | null;
  isOwner: boolean;
}

export function NetworkMembersPanel({ networkId, isOwner }: NetworkMembersPanelProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<NetworkMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!networkId) return;
    setLoading(true);
    getNetworkMembers(networkId)
      .then(setMembers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [networkId]);

  const handleRemove = async (memberId: string) => {
    setRemoving(memberId);
    try {
      await removeMember(memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      // silent
    } finally {
      setRemoving(null);
    }
  };

  if (!networkId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Members
        </h2>
        <span className="text-xs text-muted-foreground">({members.length})</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : members.length === 0 ? (
        <p className="text-xs text-muted-foreground">No members.</p>
      ) : (
        <div className="space-y-2">
          {members.map((m) => (
            <div key={m.id} className="p-3 rounded-md bg-muted border border-border text-xs font-mono flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {m.role === "owner" ? (
                  <Crown className="h-3 w-3 text-primary shrink-0" />
                ) : (
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className="text-foreground truncate">{m.email || m.user_id.slice(0, 8)}</span>
                <span className="text-muted-foreground">({m.role})</span>
              </div>
              {isOwner && m.role !== "owner" && m.user_id !== user?.id && (
                <button
                  onClick={() => handleRemove(m.id)}
                  disabled={removing === m.id}
                  className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                >
                  {removing === m.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
