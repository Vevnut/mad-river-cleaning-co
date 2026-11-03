import { useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Owner-only download of everything: the database plus every job photo and expense receipt. */
export function FullBackup() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const download = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(""); setDone("");
    try {
      const res = await apiRequest("POST", "/api/backup/full", { password });
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || "Mad River Cleaning Co. - Full Backup.zip";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setPassword("");
      setDone(`Downloaded ${name} (${(blob.size / 1048576).toFixed(1)} MB).`);
    } catch (err) {
      setError((err as Error).message);
    } finally { setBusy(false); }
  };

  return <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base">Full Backup</CardTitle>
      <p className="text-xs text-muted-foreground">
        One file with all your data: customers, properties, jobs, invoices, payments, expenses, staff, sign-in accounts,
        plus every job photo and expense receipt. Use it to keep a safe copy or to move to new hosting. Nothing in the app changes.
      </p>
    </CardHeader>
    <CardContent className="max-w-lg">
      <form onSubmit={download} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="backup-password">Your password</Label>
          <Input id="backup-password" type="password" autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)} data-testid="input-backup-password" />
          <p className="text-xs text-muted-foreground">Asked again because the backup contains everything, including customer details and sign-in accounts. The file itself isn't password-protected, so keep it private (don't email it or leave it in a shared folder).</p>
        </div>
        <Button type="submit" disabled={busy || !password} className="gap-2" data-testid="button-download-backup">
          <Download className="h-4 w-4" />{busy ? "Preparing backup…" : "Download full backup"}
        </Button>
        {error && <p className="text-sm text-destructive" data-testid="text-backup-error">{error}</p>}
        {done && <p className="text-sm text-muted-foreground flex items-center gap-1.5" data-testid="text-backup-done"><ShieldCheck className="h-4 w-4" />{done} Keep it somewhere private.</p>}
      </form>
    </CardContent>
  </Card>;
}
