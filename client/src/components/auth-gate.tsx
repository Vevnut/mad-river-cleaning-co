import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { apiRequest, setSessionToken, queryClient, resumeSavedSession, setNoResume } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MadRiverMark } from "@/components/logo";
import { CrewSignIn, type SignInStatus } from "@/components/crew-sign-in";

/** Who's signed in. Cleaners get My jobs; owners get the whole workspace. The server enforces this too. */
export type Session = { email: string; role: "owner" | "cleaner" };
const asSession = (r: any): Session => ({ email: r.email, role: r.role === "cleaner" ? "cleaner" : "owner" });

export function AuthGate({ children }: { children: (session: Session) => React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const crew = location.startsWith("/crew");
  const [session, setSession] = useState<Session | null>(null);
  // A cleaner who chose "Keep me signed in" skips the sign-in page while their saved session is valid.
  const [resuming, setResuming] = useState(true);
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  // Cleaners whose session ends go back to the cleaner sign-in, not the office one.
  const role = useRef<Session["role"] | null>(null);
  role.current = session?.role ?? null;
  useEffect(() => {
    const expire = () => {
      if (role.current === "cleaner") setLocation("/crew");
      setSession(null); queryClient.clear(); setError("Your session expired. Please sign in again.");
    };
    window.addEventListener("workspace-session-expired", expire);
    return () => window.removeEventListener("workspace-session-expired", expire);
  }, [setLocation]);
  useEffect(() => {
    let cancelled = false;
    resumeSavedSession().then(async token => {
      if (!token || cancelled) return;
      setSessionToken(token);
      try { const r = await (await apiRequest("GET", "/api/session")).json(); if (!cancelled) setSession(asSession(r)); }
      catch {
        // Only cleaners save sessions, so a saved one that no longer works (password reset, login off) means a cleaner.
        setSessionToken(""); setLocation("/crew");
        setError("You've been signed out. Sign in again, or ask the office if your login stopped working.");
      }
    }).finally(() => { if (!cancelled) setResuming(false); });
    return () => { cancelled = true; };
  }, [setLocation]);
  const { data: status, error: statusError } = useQuery<SignInStatus & { setupRequired: boolean; setupAvailable: boolean }>({ queryKey: ["/api/auth/status"] });

  const signIn = async (action: "login" | "setup", body: Record<string, unknown>) => {
    setBusy(true); setError("");
    try {
      const result = await (await apiRequest("POST", `/api/auth/${action}`, body)).json();
      setSessionToken(result.token); queryClient.clear(); setPassword(""); setSetupToken(""); setNoResume(false);
      if (crew) setLocation("/");
      setSession(asSession(result));
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  if (session) return <>{children(session)}</>;
  if (resuming) return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4">
      <MadRiverMark className="h-16 w-16 rounded-full object-cover" />
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Signing you in" />
    </div>
  );
  if (crew && !status?.setupRequired) return (
    <CrewSignIn status={status} busy={busy} error={error || (statusError ? (statusError as Error).message : "")}
      onSignIn={(email, password, remember) => signIn("login", { email, password, remember })} />
  );
  return <div className="min-h-screen flex items-center justify-center p-5 bg-muted/30">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Mad River Cleaning Co.</CardTitle><p className="text-sm text-muted-foreground">{status?.setupRequired ? "Set up your protected business workspace." : "Sign in to your business workspace."}</p></CardHeader>
      <CardContent><form className="space-y-4" onSubmit={e => {
        e.preventDefault();
        signIn(status?.setupRequired ? "setup" : "login", { email, password, setupToken });
      }}>
        <div className="space-y-2"><Label htmlFor="login-email">Email</Label><Input id="login-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="login-password">Password</Label><Input id="login-password" type="password" minLength={12} autoComplete={status?.setupRequired ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} required /></div>
        {status?.setupRequired && <div className="space-y-2"><Label htmlFor="setup-token">Server setup token</Label><Input id="setup-token" type="password" autoComplete="off" value={setupToken} onChange={e => setSetupToken(e.target.value)} required /><p className="text-xs text-muted-foreground">Only the deployment owner can initialize this workspace. Set AUTH_SETUP_TOKEN securely on the server first.</p></div>}
        {(error || statusError) && <p role="alert" className="text-sm text-destructive">{error || (statusError as Error).message}</p>}
        <Button className="w-full" disabled={busy || !status || (status.setupRequired && !status.setupAvailable)}>{busy ? "Signing in…" : status?.setupRequired ? "Create workspace account" : "Sign in"}</Button>
        <p className="text-xs text-muted-foreground">Sessions last up to 12 hours. Refreshing signs you out; no password or session is stored in the browser.</p>
        {!status?.setupRequired && <a href="#/crew" className="block text-center text-sm text-primary underline-offset-2 hover:underline" data-testid="link-crew-sign-in">Cleaner or subcontractor? Sign in here</a>}
      </form></CardContent>
    </Card>
  </div>;
}
