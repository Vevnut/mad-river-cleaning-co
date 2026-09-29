import { useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, Download, FileCheck2, HardHat, Plus } from "lucide-react";
import { necThreshold } from "@shared/subcontractors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { businessDate, formatDate, formatMoney } from "@/lib/format";
import { exportRowsToCsv } from "@/lib/csv-export";
import { SubcontractorDialog, useSubcontractors } from "@/components/subcontractors/sub-dialogs";

/** Days until an ISO date (negative when past). */
export function daysUntil(iso: string) {
  const [y, m, d] = businessDate().split("-").map(Number), [y2, m2, d2] = iso.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y, m - 1, d)) / 86400000);
}
export function insuranceNote(iso: string | null): { text: string; warn: boolean } | null {
  if (!iso) return null;
  const n = daysUntil(iso);
  if (n < 0) return { text: `Insurance expired ${formatDate(iso)}`, warn: true };
  if (n <= 30) return { text: `Insurance expires ${formatDate(iso)}`, warn: true };
  return { text: `Insured through ${formatDate(iso)}`, warn: false };
}

export default function SubcontractorsPage() {
  const { data: subs = [], isLoading } = useSubcontractors();
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const year = Number(businessDate().slice(0, 4));
  const nec = necThreshold(year);
  const shown = subs.filter(s => showInactive || s.active);
  const inactive = subs.length - subs.filter(s => s.active).length;
  const totals = useMemo(() => subs.reduce((t, s) => ({ paid: t.paid + s.paidThisYear, owed: t.owed + Math.max(0, s.owed), need1099: t.need1099 + (s.paidThisYear >= nec.amount ? 1 : 0) }), { paid: 0, owed: 0, need1099: 0 }), [subs, nec.amount]);

  function export1099() {
    exportRowsToCsv(`subcontractors-${year}-payments.csv`,
      ["Name", "Business", "Email", "Phone", `Paid in ${year}`, "1099-NEC likely", "W-9 on file", "Insurance expires", "Active"],
      subs.map(s => [s.name, s.businessName ?? "", s.email ?? "", s.phone ?? "", s.paidThisYear.toFixed(2), s.paidThisYear >= nec.amount ? "Yes" : "No", s.w9OnFile ? "Yes" : "No", s.insuranceExpires ?? "", s.active ? "Yes" : "No"]));
  }

  return (
    <div className="min-w-0 space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">Subcontractors</h1>
          <p className="text-sm text-muted-foreground">Who you hire out work to, what they're owed and what you've paid.</p>
        </div>
        <Button onClick={() => setAdding(true)} className="gap-1.5" data-testid="button-add-sub"><Plus className="h-4 w-4" />Add subcontractor</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { title: `Paid in ${year}`, value: formatMoney(totals.paid), sub: "All subcontractors, year to date", id: "paid" },
          { title: "Owed now", value: formatMoney(totals.owed), sub: "Finished jobs not yet paid", id: "owed" },
          { title: "1099-NEC likely", value: String(totals.need1099), sub: `Paid ${formatMoney(nec.amount)}+ in ${year}${nec.confirmed ? "" : " (check the IRS threshold)"}`, id: "1099" },
        ].map(k => (
          <Card key={k.id}>
            <CardContent className="pt-5">
              <p className="text-xs text-muted-foreground">{k.title}</p>
              <p className="text-xl font-semibold tabular-nums" data-testid={`text-sub-kpi-${k.id}`}>{isLoading ? "—" : k.value}</p>
              <p className="text-xs text-muted-foreground">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">Everyone</CardTitle>
          <div className="flex flex-wrap gap-2">
            {inactive > 0 && <Button size="sm" variant="ghost" onClick={() => setShowInactive(v => !v)} data-testid="button-toggle-inactive-subs">{showInactive ? "Hide inactive" : `Show inactive (${inactive})`}</Button>}
            <Button size="sm" variant="outline" className="gap-1.5" onClick={export1099} disabled={!subs.length} data-testid="button-export-subs-csv"><Download className="h-3.5 w-3.5" />{year} payments CSV</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-40 w-full" /> : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground" data-testid="empty-subs">
              <HardHat className="h-6 w-6" />
              <p className="text-sm">No subcontractors yet.</p>
              <p className="text-xs">Add the people you hire out cleans, laundry or repairs to. Then assign them on a job.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border">
              <Table data-testid="table-subs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Paperwork</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Paid {year}</TableHead>
                    <TableHead className="text-right">Owed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map(s => {
                    const ins = insuranceNote(s.insuranceExpires);
                    const flags = (!s.w9OnFile && s.paidThisYear > 0 ? 1 : 0) + (ins?.warn ? 1 : 0);
                    return (
                      <TableRow key={s.id} data-testid={`row-sub-${s.id}`}>
                        <TableCell className="align-top">
                          <Link href={`/subcontractors/${s.id}`} className="font-medium hover:underline" data-testid={`link-sub-${s.id}`}>{s.name}</Link>
                          {!s.active && <Badge variant="outline" className="ml-2 text-xs">Inactive</Badge>}
                          <p className="text-xs text-muted-foreground">{[s.businessName, s.services].filter(Boolean).join(" · ") || s.phone || "—"}</p>
                          {flags > 0 && <p className="mt-0.5 flex items-center gap-1 text-xs text-status-overdue md:hidden"><AlertTriangle className="h-3 w-3" />{!s.w9OnFile && s.paidThisYear > 0 ? "No W-9" : ins?.text}</p>}
                          <p className="text-xs text-muted-foreground sm:hidden tabular-nums">Paid {formatMoney(s.paidThisYear)} in {year}</p>
                        </TableCell>
                        <TableCell className="hidden align-top md:table-cell">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant={s.w9OnFile ? "secondary" : "outline"} className={`gap-1 text-xs ${!s.w9OnFile && s.paidThisYear > 0 ? "border-status-overdue text-status-overdue" : ""}`}>
                              <FileCheck2 className="h-3 w-3" />{s.w9OnFile ? "W-9" : "No W-9"}
                            </Badge>
                            {s.paidThisYear >= nec.amount && <Badge variant="outline" className="text-xs">1099 likely</Badge>}
                          </div>
                          {ins && <p className={`mt-1 text-xs ${ins.warn ? "text-status-overdue" : "text-muted-foreground"}`}>{ins.text}</p>}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-right align-top text-sm tabular-nums sm:table-cell">{formatMoney(s.paidThisYear)}</TableCell>
                        <TableCell className={`whitespace-nowrap text-right align-top text-sm font-medium tabular-nums ${s.owed > 0 ? "" : "text-muted-foreground"}`} data-testid={`text-sub-owed-${s.id}`}>
                          {s.owed < 0 ? <span title="Paid ahead of finished work">{formatMoney(-s.owed)} ahead</span> : formatMoney(s.owed)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Owed is pay for their completed jobs minus payments recorded. For payments made in {year}, a 1099-NEC is generally due once you've paid someone {formatMoney(nec.amount)} or more for services.
          </p>
        </CardContent>
      </Card>

      <SubcontractorDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
