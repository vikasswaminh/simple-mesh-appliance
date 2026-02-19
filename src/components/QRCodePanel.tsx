import { useState } from "react";
import { QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { generateWireGuardConfig, type Peer } from "@/lib/api";

interface QRCodePanelProps {
  networkId: string | null;
  privateKey: string;
  virtualIp: string;
  peers: Peer[];
}

export function QRCodePanel({ networkId, privateKey, virtualIp, peers }: QRCodePanelProps) {
  const [mode, setMode] = useState<"network" | "config">("network");

  if (!networkId) return null;

  const value = mode === "network"
    ? networkId
    : generateWireGuardConfig(privateKey, virtualIp, peers);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <QrCode className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          QR Code
        </h2>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode("network")}
          className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
            mode === "network" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/50"
          }`}
        >
          Network ID
        </button>
        {privateKey && virtualIp && (
          <button
            onClick={() => setMode("config")}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
              mode === "config" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/50"
            }`}
          >
            WG Config
          </button>
        )}
      </div>

      <div className="flex justify-center p-4 bg-white rounded-md">
        <QRCodeSVG value={value} size={180} />
      </div>

      <p className="text-xs text-muted-foreground mt-3 text-center">
        {mode === "network" ? "Scan to get the network ID" : "Scan to import WireGuard config"}
      </p>
    </div>
  );
}
