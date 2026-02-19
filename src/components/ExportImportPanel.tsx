import { useState } from "react";
import { Download, Upload, Loader2, Check } from "lucide-react";
import { getPeers, type Peer, type NetworkInfo } from "@/lib/api";

interface ExportImportPanelProps {
  networkId: string | null;
  networks: NetworkInfo[];
  peers: Peer[];
}

export function ExportImportPanel({ networkId, networks, peers }: ExportImportPanelProps) {
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const handleExport = () => {
    const activeNet = networks.find((n) => n.id === networkId);
    const exportData = {
      version: "1.0",
      exported_at: new Date().toISOString(),
      network: activeNet || { id: networkId },
      peers,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `network-${(networkId || "export").slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setImporting(true);
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.network?.id || !data.peers) {
          setImportResult("Invalid export file format");
          return;
        }
        setImportResult(`Loaded: ${data.network.id.slice(0, 8)}... with ${data.peers.length} peers`);
      } catch {
        setImportResult("Failed to parse file");
      } finally {
        setImporting(false);
        setTimeout(() => setImportResult(null), 4000);
      }
    };
    input.click();
  };

  if (!networkId) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Download className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Export / Import
        </h2>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleExport}
          className="flex-1 py-2 px-3 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 border border-border"
        >
          <Download className="h-3 w-3" />
          Export JSON
        </button>
        <button
          onClick={handleImport}
          disabled={importing}
          className="flex-1 py-2 px-3 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 border border-border disabled:opacity-50"
        >
          {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          Import JSON
        </button>
      </div>

      {importResult && (
        <p className="text-xs text-primary mt-2 flex items-center gap-1">
          <Check className="h-3 w-3" />
          {importResult}
        </p>
      )}
    </div>
  );
}
