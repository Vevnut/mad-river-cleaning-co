import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, setSessionToken, queryClient } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/** Who's signed in. Cleaners get My jobs; owners get the whole workspace. The server enforces this too. */
export type Session = { email: string; role: "owner" | "cleaner" };

export function AuthGate({ children }: { children: (session: Session) => React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const expire = () => { setSession(null); queryClient.clear(); setError("Your session expired. Please sign in again."); };
    window.addEventListener("workspace-session-expired", expire);
    return () => window.removeEventListener("workspace-session-expired", expire);
  }, []);
  const { data: status, error: statusError } = useQuery<any>({ queryKey: ["/api/auth/status"] });
  if (session) return <>{children(session)}</>;
  return <div className="min-h-screen flex items-center justify-center p-5 bg-muted/30">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Mad River Cleaning Co.</CardTitle><p className="text-sm text-muted-foreground">{status?.setupRequired ? "Set up your protected business workspace." : "Sign in to your business workspace or your cleaning jobs."}</p></CardHeader>
      <CardContent><form className="space-y-4" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError("");
        try {
          const result = await (await apiRequest("POST", `/api/auth/${status?.setupRequired ? "setup" : "login"}`, { email, password, setupToken })).json();
          setSessionToken(result.token); queryClient.clear(); setPassword(""); setSetupToken("");
          setSession({ email: result.email, role: result.role === "cleaner" ? "cleaner" : "owner" });
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
      }}>
        <div className="space-y-2"><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" minLength={12} autoComplete={status?.setupRequired ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} required /></div>
        {status?.setupRequired && <div className="space-y-2"><Label htmlFor="setup-token">Server setup token</Label><Input id="setup-token" type="password" autoComplete="off" value={setupToken} onChange={e => setSetupToken(e.target.value)} required /><p className="text-xs text-muted-foreground">Only the deployment owner can initialize this workspace. Set AUTH_SETUP_TOKEN securely on the server first.</p></div>}
        {(error || statusError) && <p role="alert" className="text-sm text-destructive">{error || (statusError as Error).message}</p>}
        <Button className="w-full" disabled={busy || !status || (status.setupRequired && !status.setupAvailable)}>{busy ? "Signing in…" : status?.setupRequired ? "Create workspace account" : "Sign in"}</Button>
        <p className="text-xs text-muted-foreground">Sessions last up to 12 hours. Refreshing signs you out; no password or session is stored in the browser.</p>
      </form></CardContent>
    </Card>
  </div>;
}
