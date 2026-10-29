import { Switch, Route, Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Phone } from "lucide-react";
import { signOut } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { MadRiverMark } from "@/components/logo";
import { type CleanerMe, dial } from "@/lib/cleaner";
import CleanerJobsPage from "@/pages/cleaner-jobs";
import CleanerJobPage from "@/pages/cleaner-job";

/** The whole app for a cleaner login: their jobs, nothing else. Phone-first. */
export function CleanerShell({ email }: { email: string }) {
  const { data: me } = useQuery<CleanerMe>({ queryKey: ["/api/cleaner/me"] });
  const phone = me?.office.phone;
  return (
    <div className="min-h-[100dvh] bg-muted/30">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <MadRiverMark className="h-9 w-9 shrink-0 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">My jobs</p>
          <p className="truncate text-xs text-muted-foreground">{me?.name ?? email}</p>
        </div>
        {phone && (
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5" data-testid="button-cleaner-call-office">
            <a href={`tel:${dial(phone)}`} aria-label={`Call ${me?.office.name}`}><Phone className="h-4 w-4" /> Office</a>
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => signOut("#/crew")} aria-label="Sign out" data-testid="button-cleaner-sign-out">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>
      <main className="pb-[env(safe-area-inset-bottom)]">
        <Switch>
          <Route path="/" component={CleanerJobsPage} />
          <Route path="/job/:id" component={CleanerJobPage} />
          <Route><Redirect to="/" /></Route>
        </Switch>
      </main>
    </div>
  );
}
