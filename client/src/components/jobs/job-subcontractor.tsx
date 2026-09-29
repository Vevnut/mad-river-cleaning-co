import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HardHat } from "lucide-react";
import type { JobAssignment } from "@shared/subcontractors";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Choice } from "@/components/billing-fields";
import { refreshSubcontractors, useSubcontractors } from "@/components/subcontractors/sub-dialogs";

/** Hire this job out to a subcontractor and set what it pays them. */
export function JobSubcontractor({ jobId, jobPrice }: { jobId: number; jobPrice: number }) {
  const { toast } = useToast();
  const key = ["/api/jobs", jobId, "subcontractor"];
  const { data: current, isLoading } = useQuery<JobAssignment>({ queryKey: key, queryFn: async () => (await apiRequest("GET", `/api/jobs/${jobId}/subcontractor`)).json() });
  const { data: subs = [] } = useSubcontractors();
  const [subId, setSubId] = useState("none");
  const [pay, setPay] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSubId(current ? String(current.subcontractorId) : "none"); setPay(current ? String(current.pay) : ""); }, [current?.subcontractorId, current?.pay]);

  const options = [{ value: "none", label: "Not hired out" }, ...subs.filter(s => s.active || String(s.id) === subId).map(s => ({ value: String(s.id), label: s.name }))];
  const dirty = subId !== (current ? String(current.subcontractorId) : "none") || (subId !== "none" && Number(pay) !== current?.pay);
  function choose(v: string) {
    setSubId(v);
    const s = subs.find(x => String(x.id) === v);
    if (s && (!current || String(current.subcontractorId) !== v)) setPay(s.defaultPay != null && s.payType === "per_job" ? String(s.defaultPay) : "");
  }
  async function save() {
    setBusy(true);
    try {
      await apiRequest("PUT", `/api/jobs/${jobId}/subcontractor`, subId === "none" ? { subcontractorId: null } : { subcontractorId: Number(subId), pay: Number(pay) || 0 });
      queryClient.invalidateQueries({ queryKey: key });
      refreshSubcontractors();
      toast({ title: subId === "none" ? "Subcontractor removed from job" : "Subcontractor saved" });
    } catch (e) { toast({ title: "Couldn't save", description: (e as Error).message, variant: "destructive" }); }
    finally { setBusy(false); }
  }
  const margin = subId !== "none" && pay !== "" ? jobPrice - Number(pay) : null;

  return (
    <Card data-testid="card-job-subcontractor">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><HardHat className="h-4 w-4 text-muted-foreground" />Subcontractor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!isLoading && subs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add someone on the <Link href="/subcontractors" className="underline">Subcontractors</Link> page to hire this job out.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Hired out to"><Choice label="Hired out to" value={subId} onChange={choose} options={options} /></Field>
              {subId !== "none" && (
                <Field label="Their pay for this job">
                  <Input type="number" inputMode="decimal" min={0} step="0.01" value={pay} onChange={e => setPay(e.target.value)} placeholder="0.00" data-testid="input-job-sub-pay" />
                </Field>
              )}
            </div>
            {margin !== null && <p className="text-xs text-muted-foreground tabular-nums" data-testid="text-job-sub-margin">Job price {formatMoney(jobPrice)} · you keep {formatMoney(margin)}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={save} disabled={busy || !dirty} data-testid="button-save-job-sub">{busy ? "Saving…" : "Save"}</Button>
              {current && <Link href={`/subcontractors/${current.subcontractorId}`} className="text-xs text-muted-foreground underline">View {current.subcontractorName}</Link>}
            </div>
            <p className="text-xs text-muted-foreground">Their pay counts as owed once the job is marked complete.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
