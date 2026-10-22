import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCheck, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { apiRequest, apiUrl, authHeaders, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { toJpeg } from "@/lib/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Section = "damage" | "final_walkthrough";
// Office photos say who added them; cleaner photos (apiBase "/api/cleaner") say whether it was you.
export type Photo = { id: number; jobId: number; section: Section; originalName: string; size: number; createdAt: string; createdBy?: string; mine?: boolean };

/** Photos are private, so they're fetched with the sign-in header rather than a public URL. */
function usePhotoUrl(id: number, apiBase: string) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoked = false, objectUrl = "";
    fetch(apiUrl(`${apiBase}/job-photos/${id}/file`), { headers: authHeaders() as HeadersInit })
      .then(r => (r.ok ? r.blob() : Promise.reject()))
      .then(b => { if (!revoked) { objectUrl = URL.createObjectURL(b); setSrc(objectUrl); } })
      .catch(() => !revoked && setFailed(true));
    return () => { revoked = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, apiBase]);
  return { src, failed };
}

function Thumb({ photo, apiBase, onOpen, onDelete }: { photo: Photo; apiBase: string; onOpen: (src: string) => void; onDelete?: () => void }) {
  const { src, failed } = usePhotoUrl(photo.id, apiBase);
  return (
    <div className="group relative aspect-square overflow-hidden rounded-md border bg-muted">
      {src ? (
        <button className="h-full w-full" onClick={() => onOpen(src)} aria-label={`View ${photo.originalName}`} data-testid={`button-view-photo-${photo.id}`}>
          <img src={src} alt={photo.originalName} className="h-full w-full object-cover" />
        </button>
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
          {failed ? "Unavailable" : <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      )}
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-foreground shadow-sm"
          aria-label={`Delete ${photo.originalName}`}
          data-testid={`button-delete-photo-${photo.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

type Access = { apiBase: string; readOnly: boolean; canDelete: (p: Photo) => boolean };

function PhotoSection({ jobId, section, title, description, icon, photos, children, apiBase, readOnly, canDelete }: {
  jobId: number; section: Section; title: string; description: string; icon: React.ReactNode; photos: Photo[]; children?: React.ReactNode;
} & Access) {
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Photo | null>(null);
  const key = [`${apiBase}/jobs`, jobId, "photos"];

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files);
    setUploading(list.length);
    let saved = 0;
    for (const file of list) {
      try {
        const blob = await toJpeg(file);
        const res = await fetch(apiUrl(`${apiBase}/jobs/${jobId}/photos?section=${section}&name=${encodeURIComponent(file.name)}`), {
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
    queryClient.invalidateQueries({ queryKey: key });
    if (saved) toast({ title: `${saved} photo${saved === 1 ? "" : "s"} added to ${title}` });
  };

  const remove = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `${apiBase}/job-photos/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: key }); toast({ title: "Photo deleted" }); },
    onError: (err: Error) => toast({ title: "Couldn't delete photo", description: err.message, variant: "destructive" }),
    onSettled: () => setDeleting(null),
  });

  return (
    <Card data-testid={`card-photos-${section}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map(p => <Thumb key={p.id} photo={p} apiBase={apiBase} onOpen={setViewing} onDelete={!readOnly && canDelete(p) ? () => setDeleting(p) : undefined} />)}
          {!readOnly && <button
            onClick={() => input.current?.click()}
            disabled={uploading > 0}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-md border border-dashed text-muted-foreground hover-elevate disabled:opacity-60"
            data-testid={`button-add-photo-${section}`}
          >
            {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="text-[10px]">{uploading ? `Adding ${uploading}…` : "Add Photos"}</span>
          </button>}
        </div>
        <input
          ref={input} type="file" accept="image/*" multiple className="hidden"
          onChange={e => upload(e.target.files)} data-testid={`input-photo-${section}`}
        />
        {!photos.length && <p className="text-xs text-muted-foreground">No photos yet.</p>}
      </CardContent>

      <Dialog open={!!viewing} onOpenChange={o => !o && setViewing(null)}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">{title} photo</DialogTitle>
          {viewing && <img src={viewing} alt={`${title} photo`} className="max-h-[80vh] w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>It will be permanently removed from {title}. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep photo</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleting && remove.mutate(deleting.id)} data-testid="button-confirm-delete-photo">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function JobPhotos({ jobId, damageNotes, onSaveDamageNotes, saving, apiBase = "/api", readOnly = false, canDelete = () => true }: {
  jobId: number; damageNotes: string | null; onSaveDamageNotes: (notes: string) => void; saving: boolean;
} & Partial<Access>) {
  const { data: photos = [] } = useQuery<Photo[]>({
    queryKey: [`${apiBase}/jobs`, jobId, "photos"],
    queryFn: async () => (await apiRequest("GET", `${apiBase}/jobs/${jobId}/photos`)).json(),
  });
  const access = { apiBase, readOnly, canDelete };
  const [notes, setNotes] = useState(damageNotes ?? "");
  useEffect(() => setNotes(damageNotes ?? ""), [damageNotes]);
  const changed = notes !== (damageNotes ?? "");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <PhotoSection
        jobId={jobId} section="damage" title="Damage"
        description="Record anything damaged, broken or missing. Only you and your team can see these."
        icon={<AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />}
        photos={photos.filter(p => p.section === "damage")} {...access}
      >
        {readOnly ? (
          notes ? <p className="whitespace-pre-wrap text-sm">{notes}</p> : null
        ) : <div className="space-y-2">
          <Textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="text-sm"
            placeholder="What's damaged, where, and when it was found"
            aria-label="Damage notes" data-testid="textarea-damage-notes"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => onSaveDamageNotes(notes)} disabled={!changed || saving} data-testid="button-save-damage-notes">
              Save Damage Notes
            </Button>
            {changed && (
              <Button size="sm" variant="ghost" onClick={() => setNotes(damageNotes ?? "")} className="gap-1">
                <X className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>
        </div>}
      </PhotoSection>
      <PhotoSection
        jobId={jobId} section="final_walkthrough" title="Final Walkthrough"
        description="Photos of the finished clean before you leave. Only you and your team can see these."
        icon={<ClipboardCheck className="h-4 w-4 text-primary" />}
        photos={photos.filter(p => p.section === "final_walkthrough")} {...access}
      />
    </div>
  );
}
