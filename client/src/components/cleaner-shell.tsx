import { Switch, Route, Redirect } from "wouter";
import { apiRequest, setSessionToken, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { MadRiverMark } from "@/components/logo";
import CleanerJobsPage from "@/pages/cleaner-jobs";
import CleanerJobPage from "@/pages/cleaner-job";

/** The whole app for a cleaner login: their jobs, nothing else. Phone-first. */
export function CleanerShell({ email }: { email: string }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur">
        <MadRiverMark className="h-7 w-7" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">My jobs</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
        <Button variant="ghost" size="sm" data-testid="button-cleaner-sign-out"
          onClick={async () => { await apiRequest("POST", "/api/logout"); setSessionToken(""); queryClient.clear(); window.location.reload(); }}>
          Sign out
        </Button>
      </header>
      <main>
        <Switch>
          <Route path="/" component={CleanerJobsPage} />
          <Route path="/job/:id" component={CleanerJobPage} />
          <Route><Redirect to="/" /></Route>
        </Switch>
      </main>
    </div>
  );
}
