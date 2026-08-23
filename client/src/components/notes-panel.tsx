import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pin, StickyNote, Send } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Note } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface NotesPanelProps {
  customerId?: number;
  propertyId?: number;
  jobId?: number;
}

export function NotesPanel({ customerId, propertyId, jobId }: NotesPanelProps) {
  const { toast } = useToast();
  const [body, setBody] = useState("");

  const params = new URLSearchParams();
  if (customerId) params.set("customerId", String(customerId));
  if (propertyId) params.set("propertyId", String(propertyId));
  if (jobId) params.set("jobId", String(jobId));
  const queryKey = ["/api/notes", customerId, propertyId, jobId];

  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/notes?${params.toString()}`);
      return res.json();
    },
  });

  const createNote = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notes", {
        customerId: customerId ?? null,
        propertyId: propertyId ?? null,
        jobId: jobId ?? null,
        authorStaffId: null,
        body,
        pinned: false,
      });
      return res.json();
    },
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Note added" });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't add note", description: err.message, variant: "destructive" });
    },
  });

  const sorted = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Textarea
          placeholder="Add a note..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="text-sm"
          data-testid="textarea-new-note"
        />
        <Button
          size="icon"
          className="shrink-0"
          disabled={!body.trim() || createNote.isPending}
          onClick={() => createNote.mutate()}
          data-testid="button-add-note"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!isLoading && sorted.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="empty-notes">
          <StickyNote className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        </div>
      )}

      <div className="space-y-2">
        {sorted.map((note) => (
          <div
            key={note.id}
            className="rounded-md border bg-card p-3 text-sm"
            data-testid={`note-${note.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap">{note.body}</p>
              {note.pinned && <Pin className="h-3.5 w-3.5 text-primary shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(note.createdAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
