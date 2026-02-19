import { useState, useEffect } from "react";
import { LogIn, Loader2, Key, AlertTriangle } from "lucide-react";
import { joinNetwork, type Peer } from "@/lib/api";
import { generateKeyPair, isX25519Supported } from "@/lib/wireguard-keys";

interface JoinNetworkPanelProps {
  onJoined: (networkId: string, virtualIp: string, peers: Peer[], privateKey: string) => void;
}

export function JoinNetworkPanel({ onJoined }: JoinNetworkPanelProps) {
  const [networkId, setNetworkId] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualPublicKey, setManualPublicKey] = useState("");
  const [manualPrivateKey, setManualPrivateKey] = useState("");
  const [cryptoSupported, setCryptoSupported] = useState(true);

  useEffect(() => {
    isX25519Supported().then((supported) => {
      setCryptoSupported(supported);
      if (!supported) setManualMode(true);
    });
  }, []);

  const handleJoin = async () => {
    if (!networkId.trim() || !endpoint.trim()) {
      setError("Network ID and endpoint are required");
      return;
    }

    if (manualMode && (!manualPublicKey.trim() || !manualPrivateKey.trim())) {
      setError("Both public and private keys are required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let publicKey: string;
      let privateKey: string;

      if (manualMode) {
        publicKey = manualPublicKey.trim();
        privateKey = manualPrivateKey.trim();
      } else {
        const keyPair = await generateKeyPair();
        publicKey = keyPair.publicKey;
        privateKey = keyPair.privateKey;
      }

      const result = await joinNetwork(networkId.trim(), publicKey, endpoint.trim());
      onJoined(networkId.trim(), result.virtual_ip, result.peers, privateKey);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LogIn className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Join Network
          </h2>
        </div>
        {cryptoSupported && (
          <button
            type="button"
            onClick={() => setManualMode(!manualMode)}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            <Key className="h-3 w-3" />
            {manualMode ? "Auto-generate keys" : "Paste own keys"}
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Network ID</label>
          <input
            type="text"
            value={networkId}
            onChange={(e) => setNetworkId(e.target.value)}
            placeholder="uuid..."
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Endpoint (ip:port)</label>
          <input
            type="text"
            value={endpoint}
            onChange={(e) => setEndpoint(e.target.value)}
            placeholder="203.0.113.1:51820"
            className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
          />
        </div>

        {manualMode ? (
          <>
            {!cryptoSupported && (
              <div className="flex items-start gap-2 text-xs text-yellow-400 bg-yellow-400/10 rounded-md p-2 border border-yellow-400/20">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>Your browser doesn't support X25519. Generate keys with <code className="font-mono bg-muted px-1 rounded">wg genkey | tee privkey | wg pubkey &gt; pubkey</code> and paste below.</span>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Public Key (base64)</label>
              <input
                type="text"
                value={manualPublicKey}
                onChange={(e) => setManualPublicKey(e.target.value)}
                placeholder="Base64-encoded WireGuard public key"
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Private Key (base64)</label>
              <input
                type="password"
                value={manualPrivateKey}
                onChange={(e) => setManualPrivateKey(e.target.value)}
                placeholder="Base64-encoded WireGuard private key"
                className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              />
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            A real Curve25519 (X25519) keypair will be generated in your browser. The private key never leaves your device.
          </p>
        )}

        <button
          onClick={handleJoin}
          disabled={loading}
          className="w-full py-2.5 px-4 rounded-md bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 border border-border"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="h-4 w-4" />
          )}
          {loading ? "Joining..." : "Join & Register"}
        </button>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    </div>
  );
}
