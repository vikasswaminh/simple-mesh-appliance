import { useState } from "react";
import { FileText, Copy, Check, Download } from "lucide-react";
import { generateWireGuardConfig, type Peer } from "@/lib/api";

interface ConfigPanelProps {
  privateKey: string;
  virtualIp: string;
  peers: Peer[];
}

export function ConfigPanel({ privateKey, virtualIp, peers }: ConfigPanelProps) {
  const [copied, setCopied] = useState(false);
  const config = generateWireGuardConfig(privateKey, virtualIp, peers);

  const handleCopy = () => {
    navigator.clipboard.writeText(config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([config], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wg0.conf";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            WireGuard Config
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
          </button>
          <button
            onClick={handleDownload}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      <pre className="p-3 rounded-md bg-muted border border-border text-xs text-foreground overflow-x-auto whitespace-pre font-mono leading-relaxed">
        {config}
      </pre>
    </div>
  );
}
