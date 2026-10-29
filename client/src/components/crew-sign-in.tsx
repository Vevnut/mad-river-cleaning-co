import { useState } from "react";
import { Eye, EyeOff, Loader2, MessageSquare, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MadRiverMark } from "@/components/logo";

import { dial } from "@/lib/cleaner";

export type SignInStatus = { businessName?: string; businessPhone?: string };

/** The cleaner and subcontractor sign-in at #/crew. Phone-first: big fields, no zooming, one thumb. */
export function CrewSignIn({ status, error, busy, onSignIn }: {
  status?: SignInStatus; error: string; busy: boolean;
  onSignIn: (email: string, password: string, remember: boolean) => void;
}) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [show, setShow] = useState(false), [remember, setRemember] = useState(true);
  const phone = status?.businessPhone || "";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gradient-to-b from-primary/10 via-background to-background px-5 py-8">
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <MadRiverMark className="mx-auto h-20 w-20 rounded-full object-cover shadow-md ring-4 ring-background" />
        <h1 className="mt-5 text-center text-2xl font-semibold">Cleaner sign in</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {status?.businessName || "Mad River Cleaning Co."} · your jobs, entry details and checklists
        </p>

        <form className="mt-8 space-y-5" onSubmit={e => { e.preventDefault(); onSignIn(email, password, remember); }}>
          <div className="space-y-2">
            <Label htmlFor="crew-email" className="text-base">Email</Label>
            <Input
              id="crew-email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              className="h-12 text-base" value={email} onChange={e => setEmail(e.target.value)} required data-testid="input-crew-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="crew-password" className="text-base">Password</Label>
            <div className="relative">
              <Input
                id="crew-password" type={show ? "text" : "password"} autoComplete="current-password" minLength={12}
                className="h-12 pr-12 text-base" value={password} onChange={e => setPassword(e.target.value)} required data-testid="input-crew-password"
              />
              {/* Wrapper holds the position: buttons are position:relative app-wide (hover-elevate). */}
              <span className="absolute inset-y-0 right-1 flex items-center">
                <Button
                  type="button" variant="ghost" size="icon" className="h-10 w-10"
                  onClick={() => setShow(s => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
                >
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </Button>
              </span>
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-background/60 p-3">
            <Checkbox checked={remember} onCheckedChange={v => setRemember(v === true)} className="mt-0.5" data-testid="checkbox-crew-remember" />
            <span className="text-sm">
              <span className="font-medium">Keep me signed in on this phone</span>
              <span className="block text-muted-foreground">For 30 days. Leave this off on a shared phone.</span>
            </span>
          </label>
          {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <Button className="h-12 w-full text-base" disabled={busy || !status} data-testid="button-crew-sign-in">
            {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Signing in…</> : "Sign in"}
          </Button>
        </form>

        <div className="mt-8 space-y-3 text-center text-sm text-muted-foreground">
          <p>Forgot your password or need a login? Ask the office.</p>
          {phone && (
            <div className="flex justify-center gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`tel:${dial(phone)}`}><Phone className="h-4 w-4" /> Call</a></Button>
              <Button asChild variant="outline" size="sm" className="gap-1.5"><a href={`sms:${dial(phone)}`}><MessageSquare className="h-4 w-4" /> Text</a></Button>
            </div>
          )}
        </div>
      </main>
      <a href="#/" className="mt-6 text-center text-xs text-muted-foreground underline-offset-2 hover:underline">Office sign in</a>
    </div>
  );
}
