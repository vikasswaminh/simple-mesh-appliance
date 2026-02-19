import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { joinViaLink } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useParams } from "react-router-dom";

const JoinViaLinkPage = () => {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate(`/auth?redirect=/join/${token}`);
      return;
    }
    if (!token) {
      setStatus("error");
      setMessage("Invalid invite link");
      return;
    }

    joinViaLink(token)
      .then((result) => {
        setStatus("success");
        setMessage(`Joined network ${result.network_id.slice(0, 8)}...`);
        setTimeout(() => navigate("/"), 2000);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err.message);
      });
  }, [user, authLoading, token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="rounded-lg border border-border bg-card p-8 max-w-sm w-full text-center">
        {status === "loading" && (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-sm text-foreground">Joining network...</p>
          </>
        )}
        {status === "success" && (
          <>
            <p className="text-lg text-primary font-semibold mb-2">✓ Joined!</p>
            <p className="text-xs text-muted-foreground">{message}</p>
            <p className="text-xs text-muted-foreground mt-2">Redirecting to dashboard...</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-lg text-destructive font-semibold mb-2">Failed</p>
            <p className="text-xs text-muted-foreground">{message}</p>
            <button onClick={() => navigate("/")} className="mt-4 text-xs text-primary hover:underline">
              Go to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default JoinViaLinkPage;
