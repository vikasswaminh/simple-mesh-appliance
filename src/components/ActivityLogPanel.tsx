import { useState, useEffect } from "react";
import { ScrollText, Loader2 } from "lucide-react";
import { getActivityLogs, type ActivityLog } from "@/lib/api";


interface ActivityLogPanelProps {
  networkId: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  peer_joined: "Peer joined",
  peer_left: "Peer left",
  peer_updated: "Peer updated endpoint",
  member_joined: "Member joined",
  member_removed: "Member removed",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ActivityLogPanel({ networkId }: ActivityLogPanelProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    if (!networkId) return;
    setLoading(true);
    try {
      const data = await getActivityLogs(networkId);
      setLogs(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    if (!networkId) return;
    // Poll every 15s for new activity (SSE handled by useRealtimePeers)
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, [networkId]);

  if (!networkId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Activity Log
        </h2>
      </div>

      {loading && logs.length === 0 ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 text-xs font-mono py-1.5 border-b border-border last:border-0">
              <span className="text-muted-foreground shrink-0 w-16">{timeAgo(log.created_at)}</span>
              <span className="text-primary">{ACTION_LABELS[log.action] || log.action}</span>
              {log.details?.virtual_ip && (
                <span className="text-muted-foreground">{log.details.virtual_ip}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
