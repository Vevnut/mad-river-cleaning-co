import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ImagePlus, Loader2 } from "lucide-react";
import { apiRequest, apiUrl, authHeaders, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { toJpeg } from "@/lib/image";
import { PhotoThumb } from "@/components/jobs/job-photos";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Photo = { id: number; originalName: string; note: string };

// Keep in step with MAX_INVOICE_PHOTOS in server/invoice-photos.ts.
const MAX_PHOTOS = 6;
// Smaller than job photos: these travel inside the PDF, which has a size limit.
const MAX_EDGE = 1400;
// Keep in step with MAX_INVOICE_PHOTO_NOTE in server/invoice-photos.ts.
const MAX_NOTE = 200;

/** Saves when the box loses focus, like the rest of the page's quick edits. */
function PhotoNote({ photo, onSaved }: { photo: Photo; onSaved: () => void }) {
  const { toast } = useToast();
  const [note, setNote] = useState(photo.note);
  useEffect(() => setNote(photo.note), [photo.note]);
  const save = async () => {
    if (note.trim() === photo.note) return;
    try { await apiRequest("PATCH", `/api/invoice-photos/${photo.id}`, { note }); onSaved(); }
    catch (err) { toast({ title: "Couldn't save the note", description: (err as Error).message, variant: "destructive" }); }
  };
  return <Textarea value={note} rows={2} maxLength={MAX_NOTE} placeholder="Add a note" aria-label={`Note for ${photo.originalName}`} className="min-h-0 resize-none text-xs" onChange={e => setNote(e.target.value)} onBlur={save} data-testid={`input-invoice-photo-note-${photo.id}`} />;
}

export function InvoicePhotos({ invoiceId, readOnly }: { invoiceId: number; readOnly: boolean }) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Photo | null>(null);
  const endpoint = `/api/invoices/${invoiceId}/photos`;
  const { data: photos = [] } = useQuery<Photo[]>({ queryKey: ["/api/invoices", invoiceId, "photos"], queryFn: async () => (await apiRequest("GET", endpoint)).json() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId] });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading(list.length);
    let saved = 0;
    for (const file of list) {
      try {
        const blob = await toJpeg(file, MAX_EDGE);
        const res = await fetch(apiUrl(`${endpoint}?name=${encodeURIComponent(file.name)}`), {
          method: "POST", headers: { ...authHeaders(), "Content-Type": "image/jpeg" } as HeadersInit, body: blob,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Upload failed.");
        saved++;
      } catch (err) {
        toast({ title: `Couldn't add ${file.name}`, description: (err as Error).message, variant: "destructive" });
      } finally {
        setUploading(n => n - 1);
      }
    }
    if (input.current) input.current.value = "";
    refresh();
    if (saved) toast({ title: `${saved} photo${saved === 1 ? "" : "s"} added to the invoice` });
  };

  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/invoice-photos/${id}`),
    onSuccess: () => { refresh(); toast({ title: "Photo removed" }); },
    onError: (err: Error) => toast({ title: "Couldn't remove photo", description: err.message, variant: "destructive" }),
    onSettled: () => setDeleting(null),
  });

  return <Card data-testid="card-invoice-photos">
    <CardHeader className="pb-3">
      <CardTitle className="text-base">Photos</CardTitle>
      <p className="text-xs text-muted-foreground">The customer sees these and their notes on the invoice, the PDF and their invoice link.</p>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map(p => <div key={p.id} className="space-y-1.5"><PhotoThumb photo={p} path={`/api/invoice-photos/${p.id}/file`} onOpen={setViewing} onDelete={readOnly ? undefined : () => setDeleting(p)} />{readOnly ? p.note && <p className="text-xs text-muted-foreground">{p.note}</p> : <PhotoNote photo={p} onSaved={refresh} />}</div>)}
        {!readOnly && photos.length < MAX_PHOTOS && <button
          onClick={() => input.current?.click()}
          disabled={uploading > 0}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover-elevate disabled:opacity-60"
          data-testid="button-add-invoice-photo"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          <span className="text-[10px]">{uploading ? `Adding ${uploading}…` : "Add Photo"}</span>
        </button>}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={e => upload(e.target.files)} data-testid="input-invoice-photo" />
      {!photos.length && <p className="text-xs text-muted-foreground">No photos on this invoice.</p>}
    </CardContent>

    <Dialog open={!!viewing} onOpenChange={o => !o && setViewing(null)}>
      <DialogContent className="max-w-4xl p-2">
        <DialogTitle className="sr-only">Invoice photo</DialogTitle>
        {viewing && <img src={viewing} alt="Invoice photo" className="max-h-[80vh] w-full rounded object-contain" />}
      </DialogContent>
    </Dialog>

    <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this photo?</AlertDialogTitle>
          <AlertDialogDescription>It will be taken off this invoice and permanently deleted. This can't be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep photo</AlertDialogCancel>
          <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)} data-testid="button-confirm-remove-invoice-photo">Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </Card>;
}
