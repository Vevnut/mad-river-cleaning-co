import { useEffect, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

/** Reads the server's file name ("Mad River Cleaning Co. - Invoice INV-… - Customer.pdf"). */
function nameFrom(header: string | null, fallback: string) {
  const star = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) try { return decodeURIComponent(star[1]); } catch { /* use the plain one */ }
  return header?.match(/filename="([^"]+)"/i)?.[1] || fallback;
}

/**
 * Download PDF (and Share PDF on phones that support it). The file is fetched as soon as
 * the buttons show, so tapping Share opens the share sheet right away (phones only allow
 * that straight after a tap).
 */
export function InvoicePdfButtons({ path, fallbackName, className }: { path: string; fallbackName: string; className?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    setFile(null); setError("");
    apiRequest("GET", path)
      .then(async res => { const blob = await res.blob(); if (!cancelled) setFile(new File([blob], nameFrom(res.headers.get("content-disposition"), fallbackName), { type: "application/pdf" })); })
      .catch(e => { if (!cancelled) setError(`Couldn't make the PDF: ${(e as Error).message}`); });
    return () => { cancelled = true; };
  }, [path, fallbackName]);

  const download = () => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url; a.download = file.name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const canShare = !!file && typeof navigator !== "undefined" && !!navigator.canShare?.({ files: [file] });
  const share = async () => {
    if (!file) return;
    try { await navigator.share({ files: [file], title: file.name.replace(/\.pdf$/i, "") }); }
    catch (e) { if ((e as Error).name !== "AbortError") download(); }
  };

  return <div className={className}>
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={download} disabled={!file} data-testid="button-download-pdf"><Download className="mr-2 h-4 w-4" />{file ? "Download PDF" : error ? "PDF unavailable" : "Preparing PDF…"}</Button>
      {canShare && <Button type="button" variant="outline" onClick={share} data-testid="button-share-pdf"><Share2 className="mr-2 h-4 w-4" />Share PDF</Button>}
    </div>
    {file && <p className="mt-1 text-xs text-muted-foreground break-all">{file.name}</p>}
    {error && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
  </div>;
}
