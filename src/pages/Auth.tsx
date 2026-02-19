import { useState } from "react";
import { Shield, LogIn, UserPlus, Loader2, KeyRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [forgotPassword, setForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotPassword) {
      if (!email.trim()) { setError("Email required"); return; }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(API_BASE + "/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        setResetSent(true);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) { setError("All fields required"); return; }
    setLoading(true);
    setError(null);
    try {
      if (isSignUp) {
        await signUp(email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const title = forgotPassword ? "Reset Password" : isSignUp ? "Create Account" : "Sign In";
  const icon = forgotPassword ? <KeyRound className="h-4 w-4 text-accent" /> : isSignUp ? <UserPlus className="h-4 w-4 text-accent" /> : <LogIn className="h-4 w-4 text-primary" />;

  return (
    <div className="min-h-screen bg-background terminal-grid relative flex items-center justify-center">
      <div className="absolute inset-0 scanline" />
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="text-center mb-8">
          <Shield className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-primary glow-text tracking-wider">
            WG_CLOUD_CTRL
          </h1>
          <p className="text-xs text-muted-foreground mt-2">
            WireGuard Cloud Controller
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-5 flex items-center gap-2">
            {icon} {title}
          </h2>

          {resetSent ? (
            <div className="text-center py-4">
              <p className="text-sm text-foreground mb-2">Check your email</p>
              <p className="text-xs text-muted-foreground">
                We sent a password reset link to <span className="text-primary">{email}</span>
              </p>
              <button
                onClick={() => { setForgotPassword(false); setResetSent(false); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors mt-4"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@example.com"
                  className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              </div>

              {!forgotPassword && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-md bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2 glow-primary"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {forgotPassword ? "Send Reset Link" : isSignUp ? "Create Account" : "Sign In"}
              </button>
            </form>
          )}

          {!resetSent && (
            <div className="mt-4 text-center space-y-2">
              <button
                onClick={() => { setIsSignUp(!isSignUp); setError(null); setForgotPassword(false); }}
                className="text-xs text-muted-foreground hover:text-primary transition-colors block mx-auto"
              >
                {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
              </button>
              {!isSignUp && !forgotPassword && (
                <button
                  onClick={() => { setForgotPassword(true); setError(null); }}
                  className="text-xs text-muted-foreground hover:text-accent transition-colors block mx-auto"
                >
                  Forgot password?
                </button>
              )}
              {forgotPassword && (
                <button
                  onClick={() => { setForgotPassword(false); setError(null); }}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors block mx-auto"
                >
                  Back to sign in
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
