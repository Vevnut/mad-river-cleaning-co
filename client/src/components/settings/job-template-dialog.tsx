import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { JobTemplate } from "@shared/schema";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { X, Plus } from "lucide-react";

export function JobTemplateDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: JobTemplate | null;
}) {
  const { toast } = useToast();
  const isEdit = !!template;
  const [name, setName] = useState("");
  const [jobType, setJobType] = useState<"turnover" | "deep_clean" | "inspection" | "one_time" | "recurring" | "custom">("turnover");
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState(90);
  const [defaultPrice, setDefaultPrice] = useState(100);
  const [description, setDescription] = useState("");
  const [checklist, setChecklist] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");

  useEffect(() => {
    if (open) {
      setName(template?.name ?? "");
      setJobType(template?.jobType ?? "turnover");
      setDefaultDurationMinutes(template?.defaultDurationMinutes ?? 90);
      setDefaultPrice(template?.defaultPrice ?? 100);
      setDescription(template?.description ?? "");
      setChecklist(template ? JSON.parse(template.defaultChecklist) : []);
    }
  }, [open, template]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name, jobType, defaultDurationMinutes, defaultPrice,
        description: description || null,
        defaultChecklist: JSON.stringify(checklist),
      };
      if (isEdit) return (await apiRequest("PATCH", `/api/job-templates/${template!.id}`, payload)).json();
      return (await apiRequest("POST", "/api/job-templates", payload)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-templates"] });
      toast({ title: isEdit ? "Template updated" : "Template created" });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Failed to save template", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" data-testid="dialog-job-template-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Job Template" : "New Job Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-template-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground block mb-1">Job Type</Label>
              <Select value={jobType} onValueChange={(v) => setJobType(v as typeof jobType)}>
                <SelectTrigger data-testid="select-template-job-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["turnover", "deep_clean", "inspection", "one_time", "recurring", "custom"].map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground block mb-1">Duration (min)</Label>
              <Input type="number" min={15} step={15} value={defaultDurationMinutes} onChange={(e) => setDefaultDurationMinutes(Number(e.target.value))} data-testid="input-template-duration" />
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1">Default Price ($)</Label>
            <Input type="number" min={0} step="1" value={defaultPrice} onChange={(e) => setDefaultPrice(Number(e.target.value))} data-testid="input-template-price" />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} data-testid="textarea-template-description" />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1">Default Checklist</Label>
            <ul className="space-y-1 mb-2">
              {checklist.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm" data-testid={`row-template-checklist-${i}`}>
                  <span className="flex-1">{item}</span>
                  <button onClick={() => setChecklist(checklist.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-template-checklist-${i}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                placeholder="Add checklist item..."
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newItem.trim()) {
                    e.preventDefault();
                    setChecklist([...checklist, newItem.trim()]);
                    setNewItem("");
                  }
                }}
                data-testid="input-new-template-checklist-item"
              />
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0"
                disabled={!newItem.trim()}
                onClick={() => { setChecklist([...checklist, newItem.trim()]); setNewItem(""); }}
                data-testid="button-add-template-checklist-item"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-template">Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending} data-testid="button-save-template">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
