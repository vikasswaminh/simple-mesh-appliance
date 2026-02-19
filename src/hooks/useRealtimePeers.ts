import { useEffect, useRef } from "react";
import { getPeers, type Peer } from "@/lib/api";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface UseRealtimePeersOptions {
  networkId: string | null;
  enabled: boolean;
  onUpdate: (peers: Peer[]) => void;
}

export function useRealtimePeers({ networkId, enabled, onUpdate }: UseRealtimePeersOptions) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!enabled || !networkId) return;

    // Initial fetch
    getPeers(networkId).then((peers) => onUpdateRef.current(peers)).catch(() => {});

    const token = localStorage.getItem("wgctrl_token");
    if (!token) return;

    let controller: AbortController | null = new AbortController();
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const connectSSE = async () => {
      if (!controller || controller.signal.aborted) return;
      try {
        const resp = await fetch(API_BASE + "/api/sse/peers?network_id=" + encodeURIComponent(networkId), {
          headers: { Authorization: "Bearer " + token },
          signal: controller.signal,
        });
        if (!resp.body) return;
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const part of parts) {
            if (part.includes("data:") && !part.includes("connected")) {
              getPeers(networkId).then((peers) => onUpdateRef.current(peers)).catch(() => {});
            }
          }
        }
      } catch (err: any) {
        if (err && err.name !== "AbortError" && controller && !controller.signal.aborted) {
          retryTimeout = setTimeout(connectSSE, 5000);
        }
      }
    };

    connectSSE();

    return () => {
      controller?.abort();
      controller = null;
      if (retryTimeout) clearTimeout(retryTimeout);
    };
  }, [enabled, networkId]);
}
