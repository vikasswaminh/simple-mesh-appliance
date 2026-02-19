import { Network, Users, Wifi, Activity } from "lucide-react";
import type { Peer, NetworkInfo } from "@/lib/api";

interface DashboardStatsProps {
  networks: NetworkInfo[];
  peers: Peer[];
  activeNetwork: string | null;
}

export function DashboardStats({ networks, peers, activeNetwork }: DashboardStatsProps) {
  const onlinePeers = peers.filter((p) => {
    if (!p.last_seen) return false;
    return Date.now() - new Date(p.last_seen).getTime() < 30_000;
  }).length;

  const stats = [
    { label: "Networks", value: networks.length, icon: Network, color: "text-primary" },
    { label: "Active", value: activeNetwork ? 1 : 0, icon: Activity, color: "text-accent" },
    { label: "Peers", value: peers.length, icon: Users, color: "text-primary" },
    { label: "Online", value: onlinePeers, icon: Wifi, color: "text-primary" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border border-border bg-card p-4 text-center">
          <s.icon className={`h-4 w-4 mx-auto mb-2 ${s.color}`} />
          <p className="text-2xl font-bold text-foreground">{s.value}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
