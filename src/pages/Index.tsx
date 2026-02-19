import { useState } from "react";
import { Network, Shield, Terminal, Globe, LogOut } from "lucide-react";
import { CreateNetworkPanel } from "@/components/CreateNetworkPanel";
import { JoinNetworkPanel } from "@/components/JoinNetworkPanel";
import { PeerListPanel } from "@/components/PeerListPanel";
import { ConfigPanel } from "@/components/ConfigPanel";
import { NetworkListPanel } from "@/components/NetworkListPanel";
import { InvitePeerPanel } from "@/components/InvitePeerPanel";
import { PendingInvitationsPanel } from "@/components/PendingInvitationsPanel";
import { NetworkMembersPanel } from "@/components/NetworkMembersPanel";
import { DashboardStats } from "@/components/DashboardStats";
import { ActivityLogPanel } from "@/components/ActivityLogPanel";
import { InviteLinkPanel } from "@/components/InviteLinkPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { QRCodePanel } from "@/components/QRCodePanel";
import { ExportImportPanel } from "@/components/ExportImportPanel";
import { useAuth } from "@/hooks/useAuth";
import { useRealtimePeers } from "@/hooks/useRealtimePeers";
import type { Peer, NetworkInfo } from "@/lib/api";

const Index = () => {
  const { user, signOut } = useAuth();
  const [activeNetwork, setActiveNetwork] = useState<string | null>(null);
  const [virtualIp, setVirtualIp] = useState<string | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [privateKey, setPrivateKey] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [networks, setNetworks] = useState<NetworkInfo[]>([]);

  useRealtimePeers({
    networkId: activeNetwork,
    enabled: !!activeNetwork,
    onUpdate: setPeers,
  });

  const handleNetworkCreated = (id: string) => {
    setActiveNetwork(id);
    setPeers([]);
    setVirtualIp(null);
    setPrivateKey("");
    setRefreshKey((k) => k + 1);
  };

  // Check if current user owns the active network
  const activeNetInfo = networks.find((n) => n.id === activeNetwork);
  const isOwner = !!activeNetInfo; // If it's in user's networks list, they own it or are a member

  return (
    <div className="min-h-screen bg-background terminal-grid relative">
      <div className="absolute inset-0 scanline" />
      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-lg font-semibold text-primary glow-text tracking-wider">
              WG_CLOUD_CTRL
            </h1>
            <span className="text-muted-foreground text-xs ml-2">v2.0.0</span>
            <div className="ml-auto flex items-center gap-4">
              <span className="text-xs text-muted-foreground font-mono">
                {user?.email}
              </span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
                ONLINE
              </div>
              <ThemeToggle />
              <button
                onClick={signOut}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="max-w-6xl mx-auto px-6 py-8">
          {/* Dashboard Stats */}
          <DashboardStats networks={networks} peers={peers} activeNetwork={activeNetwork} />

          {/* Status bar */}
          <div className="flex items-center gap-4 mt-6 mb-8 text-xs text-muted-foreground font-mono flex-wrap">
            <div className="flex items-center gap-2">
              <Terminal className="h-3 w-3" />
              <span>subnet: 10.10.0.0/24</span>
            </div>
            <span className="text-border">|</span>
            <div className="flex items-center gap-2">
              <Network className="h-3 w-3" />
              <span>
                network:{" "}
                {activeNetwork ? (
                  <span className="text-primary">
                    {activeNetInfo?.name || activeNetwork.slice(0, 8) + "..."}
                  </span>
                ) : (
                  <span>none</span>
                )}
              </span>
            </div>
            {virtualIp && (
              <>
                <span className="text-border">|</span>
                <div className="flex items-center gap-2">
                  <Globe className="h-3 w-3" />
                  <span>
                    vip: <span className="text-primary">{virtualIp}</span>
                  </span>
                </div>
              </>
            )}
            {activeNetwork && (
              <>
                <span className="text-border">|</span>
                <div className="flex items-center gap-2">
                  <span className="text-primary">⚡</span>
                  <span>realtime: active</span>
                </div>
              </>
            )}
          </div>

          {/* Pending Invitations */}
          <PendingInvitationsPanel
            onAccepted={(networkId) => {
              setActiveNetwork(networkId);
              setPeers([]);
              setVirtualIp(null);
              setPrivateKey("");
              setRefreshKey((k) => k + 1);
            }}
          />

          {/* Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="space-y-6">
              <CreateNetworkPanel onCreated={handleNetworkCreated} />
              <NetworkListPanel
                refreshKey={refreshKey}
                activeNetwork={activeNetwork}
                onSelect={(id) => {
                  setActiveNetwork(id);
                  setPeers([]);
                  setVirtualIp(null);
                  setPrivateKey("");
                }}
                onNetworksLoaded={setNetworks}
              />
              <JoinNetworkPanel
                onJoined={(networkId, vip, peerList, privKey) => {
                  setActiveNetwork(networkId);
                  setVirtualIp(vip);
                  setPeers(peerList);
                  setPrivateKey(privKey);
                }}
              />
              <ActivityLogPanel networkId={activeNetwork} />
            </div>
            <div className="space-y-6">
              <InvitePeerPanel networkId={activeNetwork} />
              <InviteLinkPanel networkId={activeNetwork} />
              <NetworkMembersPanel networkId={activeNetwork} isOwner={isOwner} />
              <PeerListPanel
                networkId={activeNetwork}
                peers={peers}
                onRefresh={setPeers}
                isOwner={isOwner}
              />
              {virtualIp && privateKey && (
                <ConfigPanel
                  privateKey={privateKey}
                  virtualIp={virtualIp}
                  peers={peers}
                />
              )}
              <QRCodePanel
                networkId={activeNetwork}
                privateKey={privateKey}
                virtualIp={virtualIp || ""}
                peers={peers}
              />
              <ExportImportPanel
                networkId={activeNetwork}
                networks={networks}
                peers={peers}
              />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Index;
