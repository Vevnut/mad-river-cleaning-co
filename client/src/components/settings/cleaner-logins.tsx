import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, KeyRound, Plus } from "lucide-react";
import type { Staff } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useSubcontractors } from "@/components/subcontractors/sub-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

type CleanerLogin = {
  id: string; email: string; active: boolean; staffId: number | null; subcontractorId: number | null;
  name: string; kind: "staff" | "subcontractor"; personActive: boolean;
};
const KEY = ["/api/team/cleaners"];
const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

function AddLogin({ open, onOpenChange, taken }: { open: boolean; onOpenChange: (o: boolean) => void; taken: CleanerLogin[] }) {
  const { toast } = useToast();
  const { data: staff = [] } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });
  const { data: subs = [] } = useSubcontractors();
  const [person, setPerson] = useState(""), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const freeStaff = staff.filter(s => s.active && !taken.some(t => t.staffId === s.id));
  const freeSubs = subs.filter(s => s.active && !taken.some(t => t.subcontractorId === s.id));
  const pick = (value: string) => {
    setPerson(value);
    const [kind, id] = value.split(":");
    const found = kind === "staff" ? staff.find(s => s.id === Number(id)) : subs.find(s => s.id === Number(id));
    if (found?.email && !email) setEmail(found.email);
  };
  const create = useMutation({
    mutationFn: async () => {
      const [kind, id] = person.split(":");
      return apiRequest("POST", "/api/team/cleaners", { email, password, [kind === "staff" ? "staffId" : "subcontractorId"]: Number(id) });
    },
    onSuccess: () => {
      refresh(); onOpenChange(false); setPerson(""); setEmail(""); setPassword("");
      toast({ title: "Cleaner login created", description: "Give them the email and password. They'll see only their own jobs." });
    },
    onError: (err: Error) => toast({ title: "Couldn't create login", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add cleaner login</DialogTitle>
          <DialogDescription>They'll sign in at the same address as you and see only the jobs they're assigned to.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); create.mutate(); }}>
          <div className="space-y-2">
            <Label>Who is it for?</Label>
            <Select value={person} onValueChange={pick}>
              <SelectTrigger data-testid="select-cleaner-person"><SelectValue placeholder="Choose a staff member or subcontractor" /></SelectTrigger>
              <SelectContent>
                {freeStaff.length > 0 && <SelectGroup><SelectLabel>Staff</SelectLabel>
                  {freeStaff.map(s => <SelectItem key={`s${s.id}`} value={`staff:${s.id}`}>{s.name}</SelectItem>)}</SelectGroup>}
                {freeSubs.length > 0 && <SelectGroup><SelectLabel>Subcontractors</SelectLabel>
                  {freeSubs.map(s => <SelectItem key={`b${s.id}`} value={`sub:${s.id}`}>{s.name}</SelectItem>)}</SelectGroup>}
              </SelectContent>
            </Select>
            {!freeStaff.length && !freeSubs.length && <p className="text-xs text-muted-foreground">Everyone active already has a login. Add people under Staff &amp; Roles or Subcontractors first.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cleaner-email">Email they'll sign in with</Label>
            <Input id="cleaner-email" type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cleaner-password">Password</Label>
            <Input id="cleaner-password" type="text" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} required />
            <p className="text-xs text-muted-foreground">At least 12 characters. Share it with them privately; you can reset it here any time.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={!person || create.isPending} data-testid="button-create-cleaner-login">Create login</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPassword({ login, onClose }: { login: CleanerLogin | null; onClose: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const reset = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/team/cleaners/${login!.id}`, { password }),
    onSuccess: () => { refresh(); onClose(); setPassword(""); toast({ title: "Password changed", description: "They've been signed out and need the new password." }); },
    onError: (err: Error) => toast({ title: "Couldn't change password", description: err.message, variant: "destructive" }),
  });
  return (
    <Dialog open={!!login} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New password for {login?.name}</DialogTitle>
          <DialogDescription>This signs them out everywhere.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); reset.mutate(); }}>
          <Input type="text" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} aria-label="New password" required />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={reset.isPending}>Change password</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Settings → Cleaner logins: who can sign in to My jobs, and turning them off. */
export function CleanerLogins() {
  const { toast } = useToast();
  const { data: logins = [], isLoading } = useQuery<CleanerLogin[]>({ queryKey: KEY });
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<CleanerLogin | null>(null);
  const crewLink = `${window.location.origin}${window.location.pathname}#/crew`;
  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => apiRequest("PATCH", `/api/team/cleaners/${id}`, { active }),
    onSuccess: (_r, v) => { refresh(); toast({ title: v.active ? "Login turned on" : "Login turned off", description: v.active ? undefined : "They've been signed out." }); },
    onError: (err: Error) => toast({ title: "Couldn't change login", description: err.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Cleaner logins</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Cleaners see only their own jobs: address, entry instructions, beds, checklist, guest timing and photos. Subcontractors also see their pay.
            They never see prices, invoices, customer contact details or internal notes.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAdding(true)} data-testid="button-add-cleaner-login"><Plus className="h-3.5 w-3.5" /> Add login</Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Send cleaners this sign-in link:</span>
          <code className="min-w-0 flex-1 truncate text-xs" data-testid="text-crew-link">{crewLink}</code>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={async () => {
            try { await navigator.clipboard.writeText(crewLink); toast({ title: "Link copied", description: "Text it to your cleaners. They can add it to their home screen." }); }
            catch { toast({ title: "Couldn't copy", description: "Press and hold the link to copy it instead." }); }
          }}><Copy className="h-3.5 w-3.5" /> Copy</Button>
        </div>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : !logins.length ? (
          <p className="text-sm text-muted-foreground">No cleaner logins yet.</p>
        ) : (
          <ul className="divide-y">
            {logins.map(l => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 py-3" data-testid={`row-cleaner-login-${l.id}`}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {l.name}<Badge variant="secondary">{l.kind === "staff" ? "Staff" : "Subcontractor"}</Badge>
                    {!l.personActive && <Badge variant="outline">Inactive person</Badge>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{l.email}</p>
                </div>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setResetting(l)}><KeyRound className="h-3.5 w-3.5" /> Reset password</Button>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={l.active} disabled={toggle.isPending} onCheckedChange={active => toggle.mutate({ id: l.id, active })} aria-label={`Login for ${l.name}`} />
                  {l.active ? "On" : "Off"}
                </label>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <AddLogin open={adding} onOpenChange={setAdding} taken={logins} />
      <ResetPassword login={resetting} onClose={() => setResetting(null)} />
    </Card>
  );
}
