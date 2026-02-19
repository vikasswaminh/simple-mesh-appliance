const API_BASE = import.meta.env.VITE_API_URL || "";

export interface Peer {
  id?: string;
  public_key: string;
  virtual_ip: string;
  endpoint: string;
  last_seen?: string;
  network_id?: string;
}

export interface NetworkInfo {
  id: string;
  name: string | null;
  description: string | null;
  created_at: string;
}

export interface NetworkMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
}

export interface ActivityLog {
  id: string;
  network_id: string;
  user_id: string | null;
  action: string;
  details: Record<string, any>;
  created_at: string;
}

export interface InviteLink {
  id: string;
  network_id: string;
  token: string;
  expires_at: string;
  max_uses: number | null;
  use_count: number;
  created_at: string;
}

function getToken(): string | null {
  return localStorage.getItem("wgctrl_token");
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: "Bearer " + token } : {}),
    ...(opts.headers as Record<string, string> || {}),
  };
  const res = await fetch(API_BASE + "/api" + path, { ...opts, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed: " + res.status);
  return data as T;
}

export async function createNetwork(name?: string, description?: string): Promise<string> {
  const data = await req<{ network_id: string }>("/networks/create", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
  return data.network_id;
}

export async function updateNetwork(id: string, name: string, description: string): Promise<void> {
  await req("/networks/" + id, { method: "PATCH", body: JSON.stringify({ name, description }) });
}

export async function deleteNetwork(id: string): Promise<void> {
  await req("/networks/" + id, { method: "DELETE" });
}

export async function getNetworks(): Promise<NetworkInfo[]> {
  const data = await req<NetworkInfo[]>("/networks");
  return data || [];
}

export async function joinNetwork(network_id: string, public_key: string, endpoint: string): Promise<{ virtual_ip: string; peers: Peer[] }> {
  return req("/peers/join", { method: "POST", body: JSON.stringify({ network_id, public_key, endpoint }) });
}

export async function getPeers(network_id: string): Promise<Peer[]> {
  const data = await req<{ peers: Peer[] }>("/peers?network_id=" + encodeURIComponent(network_id));
  return data.peers || [];
}

export async function removePeer(peerId: string): Promise<void> {
  await req("/peers/" + encodeURIComponent(peerId), { method: "DELETE" });
}

export async function getNetworkMembers(networkId: string): Promise<NetworkMember[]> {
  const data = await req<NetworkMember[]>("/networks/" + networkId + "/members");
  return data || [];
}

export async function removeMember(memberId: string): Promise<void> {
  await req("/members/" + memberId, { method: "DELETE" });
}

export async function getActivityLogs(networkId: string, limit = 50): Promise<ActivityLog[]> {
  const data = await req<any[]>("/activity?network_id=" + encodeURIComponent(networkId) + "&limit=" + limit);
  return (data || []).map((log) => ({
    ...log,
    action: log.action || log.event_type || "",
    details: log.details || log.metadata || {},
  }));
}

export async function createInviteLink(networkId: string, maxUses?: number): Promise<InviteLink> {
  return req("/invite-links", { method: "POST", body: JSON.stringify({ network_id: networkId, max_uses: maxUses }) });
}

export async function getInviteLinks(networkId: string): Promise<InviteLink[]> {
  const data = await req<any[]>("/invite-links?network_id=" + encodeURIComponent(networkId));
  return (data || []).map((l) => ({ ...l, use_count: l.use_count ?? l.uses ?? 0 }));
}

export async function deleteInviteLink(id: string): Promise<void> {
  await req("/invite-links/" + id, { method: "DELETE" });
}

export async function joinViaLink(token: string): Promise<{ network_id: string }> {
  return req("/invite-links/join", { method: "POST", body: JSON.stringify({ token }) });
}

export async function getPendingInvitations(): Promise<any[]> {
  const data = await req<any[]>("/invitations/pending");
  return data || [];
}

export async function acceptInvitation(invitation_id: string, action: "accept" | "decline"): Promise<any> {
  return req("/invitations/accept", { method: "POST", body: JSON.stringify({ invitation_id, action }) });
}

export async function createInvitation(network_id: string, invited_email: string): Promise<any> {
  return req("/invitations", { method: "POST", body: JSON.stringify({ network_id, invited_email }) });
}

export function generateWireGuardConfig(privateKey: string, virtualIp: string, peers: Peer[]): string {
  let config = `[Interface]\nPrivateKey = ${privateKey}\nAddress = ${virtualIp}/24\n`;
  for (const peer of peers) {
    if (peer.virtual_ip === virtualIp) continue;
    config += `\n[Peer]\nPublicKey = ${peer.public_key}\nEndpoint = ${peer.endpoint}\nAllowedIPs = ${peer.virtual_ip}/32\nPersistentKeepalive = 25\n`;
  }
  return config;
}
