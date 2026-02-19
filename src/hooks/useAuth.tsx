import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthSession {
  access_token: string;
  user: AuthUser;
}

interface AuthContextType {
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function saveSession(token: string, user: AuthUser) {
  localStorage.setItem("wgctrl_token", token);
  localStorage.setItem("wgctrl_user", JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem("wgctrl_token");
  localStorage.removeItem("wgctrl_user");
}

function loadSession(): { token: string; user: AuthUser } | null {
  const token = localStorage.getItem("wgctrl_token");
  const raw = localStorage.getItem("wgctrl_user");
  if (!token || !raw) return null;
  try { return { token, user: JSON.parse(raw) }; } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setUser(saved.user);
      setSession({ access_token: saved.token, user: saved.user });
    }
    setLoading(false);
  }, []);

  const signUp = async (email: string, password: string) => {
    const res = await fetch(API_BASE + "/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sign up failed");
    const u: AuthUser = { id: data.user_id, email };
    saveSession(data.token, u);
    setUser(u);
    setSession({ access_token: data.token, user: u });
  };

  const signIn = async (email: string, password: string) => {
    const res = await fetch(API_BASE + "/api/auth/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sign in failed");
    const u: AuthUser = { id: data.user_id, email: data.email || email };
    saveSession(data.token, u);
    setUser(u);
    setSession({ access_token: data.token, user: u });
  };

  const signOut = async () => {
    const token = localStorage.getItem("wgctrl_token");
    if (token) {
      try {
        await fetch(API_BASE + "/api/auth/signout", {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
        });
      } catch {}
    }
    clearSession();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
