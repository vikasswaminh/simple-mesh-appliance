import { useState, useEffect } from "react";
import { Shield, KeyRound, Loader2, CheckCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API_BASE + "/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer reset:" + token },
        body: JSON.stringify({ password, token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password");
      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background terminal-grid relative flex items-center justify-center">
      <div className="absolute inset-0 scanline" />
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-8">
          <Shield className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-primary glow-text tracking-wider">
            WG_CLOUD_CTRL
          </h1>
          <p className="text-xs text-muted-foreground mt-2">Reset Your Password</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          {success ? (
            <div className="text-center py-4">
              <CheckCircle className="h-8 w-8 text-primary mx-auto mb-3" />
              <p className="text-sm text-foreground">Password updated successfully!</p>
              <p className="text-xs text-muted-foreground mt-1">Redirecting...</p>
            </div>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-5 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                Set New Password
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>
                {error && <p className="text-xs text-destructive">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 glow-primary"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Update Password
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
