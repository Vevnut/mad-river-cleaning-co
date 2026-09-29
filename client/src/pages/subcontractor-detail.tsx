import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { necThreshold, SUB_PAYMENT_METHODS, type Subcontractor, type SubJob, type SubPayment } from "@shared/subcontractors";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { businessDate, formatDate, formatMoney } from "@/lib/format";
import { PaymentDialog, SubcontractorDialog, refreshSubcontractors } from "@/components/subcontractors/sub-dialogs";
import { insuranceNote } from "@/pages/subcontractors";

type Detail = { subcontractor: Subcontractor; jobs: SubJob[]; payments: SubPayment[] };
const methodLabel = (m: string | null) => SUB_PAYMENT_METHODS.find(x => x.value === m)?.label ?? "";
const statusLabel = (s: string) => s.replace("_", " ");

export default function SubcontractorDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<Detail>({ queryKey: ["/api/subcontractors", Number(id)], queryFn: async () => (await apiRequest("GET", `/api/subcontractors/${id}`)).json() });
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [removePayment, setRemovePayment] = useState<SubPayment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const year = Number(businessDate().slice(0, 4));

  if (isLoading) return <div className="space-y-4 p-4 md:p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>;
  if (error || !data) return (
    <div className="space-y-3 p-4 md:p-6">
      <p className="text-sm text-muted-foreground">This subcontractor wasn't found.</p>
      <Button variant="outline" size="sm" onClick={() => navigate("/subcontractors")}>Back to subcontractors</Button>
    </div>
  );
  const { subcontractor: s, jobs, payments } = data;
  const ins = insuranceNote(s.insuranceExpires);
  const nec = necThreshold(year);
  const refresh = () => { refreshSubcontractors(); queryClient.invalidateQueries({ queryKey: ["/api/subcontractors", s.id] }); };

  async function deletePayment() {
    if (!removePayment) return;
    try { await apiRequest("DELETE", `/api/subcontractor-payments/${removePayment.id}`); refresh(); toast({ title: "Payment removed" }); }
    catch (e) { toast({ title: "Couldn't remove payment", description: (e as Error).message, variant: "destructive" }); }
    setRemovePayment(null);
  }
  async function deleteSub() {
    try { await apiRequest("DELETE", `/api/subcontractors/${s.id}`); refreshSubcontractors(); toast({ title: `${s.name} removed` }); navigate("/subcontractors"); }
    catch (e) { toast({ title: "Can't delete", description: (e as Error).message, variant: "destructive" }); }
    setConfirmDelete(false);
  }

  return (
    <div className="min-w-0 space-y-6 p-4 md:p-6">
      <Link href="/subcontractors" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" />Subcontractors</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold" data-testid="text-page-title">{s.name}{!s.active && <Badge variant="outline">Inactive</Badge>}</h1>
          <p className="text-sm text-muted-foreground">{[s.businessName, s.services].filter(Boolean).join(" · ")}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {s.phone && <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{s.phone}</a>}
            {s.email && <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{s.email}</a>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPaying(true)} className="gap-1.5" data-testid="button-record-payment"><Plus className="h-4 w-4" />Record payment</Button>
          <Button variant="outline" onClick={() => setEditing(true)} className="gap-1.5" data-testid="button-edit-sub"><Pencil className="h-4 w-4" />Edit</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Owed now", value: s.owed < 0 ? `${formatMoney(-s.owed)} ahead` : formatMoney(s.owed), sub: `${formatMoney(s.earned)} earned · ${formatMoney(s.paid)} paid`, id: "owed" },
          { title: `Paid in ${year}`, value: formatMoney(s.paidThisYear), sub: s.paidThisYear >= nec.amount ? "1099-NEC likely needed" : `1099-NEC at ${formatMoney(nec.amount)}+`, id: "year" },
          { title: "Jobs", value: String(s.completedJobs), sub: `${s.upcomingJobs} upcoming`, id: "jobs" },
          { title: "Pay", value: s.defaultPay != null ? formatMoney(s.defaultPay) : "—", sub: s.payType === "hourly" ? "Per hour" : "Default per job", id: "pay" },
        ].map(k => (
          <Card key={k.id}><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground">{k.title}</p>
            <p className="text-xl font-semibold tabular-nums" data-testid={`text-sub-detail-${k.id}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.sub}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Paperwork</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className={!s.w9OnFile && s.paidThisYear > 0 ? "text-status-overdue" : ""}>{s.w9OnFile ? "W-9 on file" : "No W-9 on file yet"}</span>
          <span className={ins?.warn ? "text-status-overdue" : "text-muted-foreground"}>{ins?.text ?? "No insurance date recorded"}</span>
          {s.notes && <p className="w-full whitespace-pre-wrap text-muted-foreground">{s.notes}</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Jobs</CardTitle></CardHeader>
          <CardContent>
            {jobs.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="empty-sub-jobs">No jobs yet. Open a job and choose {s.name} under Subcontractor.</p> : (
              <div className="overflow-hidden rounded-md border"><Table data-testid="table-sub-jobs">
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Job</TableHead><TableHead className="text-right">Pay</TableHead></TableRow></TableHeader>
                <TableBody>{jobs.map(j => (
                  <TableRow key={j.jobId} className="cursor-pointer" onClick={() => navigate(`/jobs/${j.jobId}`)} data-testid={`row-sub-job-${j.jobId}`}>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDate(j.scheduledDate)}</TableCell>
                    <TableCell className="text-sm"><span className="font-medium">{j.propertyName ?? "Job"}</span><span className="block text-xs capitalize text-muted-foreground">{statusLabel(j.status)} · {statusLabel(j.jobType)}</span></TableCell>
                    <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">{formatMoney(j.pay)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Payments</CardTitle></CardHeader>
          <CardContent>
            {payments.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="empty-sub-payments">No payments recorded yet.</p> : (
              <div className="overflow-hidden rounded-md border"><Table data-testid="table-sub-payments">
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Details</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                <TableBody>{payments.map(p => (
                  <TableRow key={p.id} data-testid={`row-sub-payment-${p.id}`}>
                    <TableCell className="whitespace-nowrap align-top text-sm tabular-nums">{formatDate(p.paidDate)}</TableCell>
                    <TableCell className="align-top text-xs text-muted-foreground">{[methodLabel(p.method), p.reference, p.jobId ? jobs.find(j => j.jobId === p.jobId)?.propertyName : null, p.note].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-right align-top text-sm font-medium tabular-nums">{formatMoney(p.amount)}</TableCell>
                    <TableCell className="align-top"><Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Remove payment" onClick={() => setRemovePayment(p)} data-testid={`button-remove-payment-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></div>
            )}
          </CardContent>
        </Card>
      </div>

      {jobs.length === 0 && payments.length === 0 && (
        <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => setConfirmDelete(true)} data-testid="button-delete-sub"><Trash2 className="h-3.5 w-3.5" />Delete subcontractor</Button>
      )}

      <SubcontractorDialog open={editing} onOpenChange={setEditing} subcontractor={s} onSaved={refresh} />
      <PaymentDialog open={paying} onOpenChange={setPaying} subcontractor={s} jobs={jobs} suggested={s.owed} />
      <AlertDialog open={!!removePayment} onOpenChange={v => !v && setRemovePayment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this payment?</AlertDialogTitle>
            <AlertDialogDescription>{removePayment && `${formatMoney(removePayment.amount)} paid ${formatDate(removePayment.paidDate)}. Their owed balance and ${year} total will change.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={deletePayment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-remove-payment">Remove payment</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete {s.name}?</AlertDialogTitle><AlertDialogDescription>They have no jobs or payments, so nothing else is affected.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={deleteSub} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
