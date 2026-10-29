import { useEffect, useState } from "react";
import { Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Android/Chrome offer an install prompt once per page load; keep it until the cleaner taps Install.
let deferred: any = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; listeners.forEach(f => f()); });
  window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach(f => f()); });
}

const DISMISSED = "mrcc.install-hint-dismissed";
const installed = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const wasDismissed = () => { try { return document.cookie.split("; ").includes(`${DISMISSED}=1`); } catch { return false; } };

/** "Add Mad River to your home screen" — phones only, until installed or dismissed. */
export function InstallHint() {
  const [, rerender] = useState(0);
  const [hidden, setHidden] = useState(() => installed() || wasDismissed());
  useEffect(() => { const f = () => rerender(n => n + 1); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  const dismiss = () => { setHidden(true); try { document.cookie = `${DISMISSED}=1; max-age=31536000; path=/; SameSite=Lax`; } catch { /* fine: shows again next time */ } };

  if (hidden || installed() || (!deferred && !isIos())) return null;
  return (
    <Card className="border-primary/30 bg-primary/5" data-testid="card-install-hint">
      <CardContent className="flex items-start gap-3 p-4">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 space-y-2 text-sm">
          <p className="font-medium">Add Mad River to your home screen</p>
          {deferred ? (
            <>
              <p className="text-muted-foreground">Open your jobs in one tap, like an app.</p>
              <Button size="sm" onClick={async () => { deferred.prompt(); await deferred.userChoice.catch(() => null); deferred = null; dismiss(); }}>Install</Button>
            </>
          ) : (
            <p className="text-muted-foreground">
              Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> at the bottom of Safari, then <span className="font-medium text-foreground">Add to Home Screen</span>.
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-8 w-8" onClick={dismiss} aria-label="Dismiss"><X className="h-4 w-4" /></Button>
      </CardContent>
    </Card>
  );
}
