import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { FileSignature, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, type AnyStatus } from "@/components/status-badge";
import { formatDate, formatMoney } from "@/lib/format";

type QuoteRow = { id: number; quoteNumber: string; issueDate: string; validUntil: string; total: number; status: AnyStatus; customerName: string; isProspect: boolean };
const STATUSES: [string, string][] = [["draft", "Draft"], ["sent", "Sent"], ["accepted", "Accepted"], ["declined", "Declined"], ["expired", "Expired"], ["canceled", "Canceled"]];

export default function QuotesListPage() {
  const [search, setSearch] = useState(""), [status, setStatus] = useState("all");
  const [, navigate] = useLocation();
  const { data: quotes = [], isLoading } = useQuery<QuoteRow[]>({ queryKey: ["/api/quotes"] });
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return quotes.filter(q => (status === "all" || q.status === status) && (!term || `${q.quoteNumber} ${q.customerName}`.toLowerCase().includes(term)));
  }, [quotes, status, search]);

  return <div className="p-4 md:p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-xl font-semibold">Quotes</h1><p className="text-sm text-muted-foreground">Price up work for new and existing customers.</p></div>
      <Link href="/quotes/new"><Button data-testid="button-new-quote"><Plus className="h-4 w-4 mr-2" />New Quote</Button></Link>
    </div>
    <div className="flex flex-wrap gap-2">
      <div className="relative min-w-[220px] flex-1 max-w-sm"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search quote or customer" aria-label="Search quotes" value={search} onChange={e => setSearch(e.target.value)} /></div>
      <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-40" aria-label="Filter by status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem>{STATUSES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
    </div>
    {isLoading ? <Skeleton className="h-40 w-full" /> : !filtered.length ? <div className="rounded-md border border-dashed p-10 text-center space-y-2">
      <FileSignature className="h-6 w-6 mx-auto text-muted-foreground" />
      <p className="text-sm font-medium">{quotes.length ? "No quotes match." : "No quotes yet."}</p>
      {!quotes.length && <p className="text-sm text-muted-foreground">Create one to send a customer a price they can accept online.</p>}
    </div> : <div className="rounded-md border overflow-x-auto"><Table>
      <TableHeader><TableRow><TableHead>Quote</TableHead><TableHead>Customer</TableHead><TableHead>Date</TableHead><TableHead>Valid until</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
      <TableBody>{filtered.map(q => <TableRow key={q.id} className="cursor-pointer" onClick={() => navigate(`/quotes/${q.id}`)} data-testid={`row-quote-${q.id}`}>
        <TableCell className="font-medium whitespace-nowrap">{q.quoteNumber}</TableCell>
        <TableCell><span className="mr-2">{q.customerName}</span>{q.isProspect && <Badge variant="outline">New</Badge>}</TableCell>
        <TableCell className="whitespace-nowrap">{formatDate(q.issueDate)}</TableCell>
        <TableCell className="whitespace-nowrap">{formatDate(q.validUntil)}</TableCell>
        <TableCell className="text-right tabular-nums">{formatMoney(q.total)}</TableCell>
        <TableCell><StatusBadge status={q.status} /></TableCell>
      </TableRow>)}</TableBody>
    </Table></div>}
  </div>;
}
