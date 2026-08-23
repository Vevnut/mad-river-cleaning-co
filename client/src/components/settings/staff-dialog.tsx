import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const COLOR_OPTIONS = ["#0e7490", "#d97706", "#7c3aed", "#059669", "#db2777", "#2563eb"];

export function StaffDialog({
  open,
  onOpenChange,
  staffMember,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffMember?: Staff | null;
}) {
  const { toast } = useToast();
  const isEdit = !!staffMember;
  const [name, setName] = useState("");
  const [role, setRole] = useState<"admin" | "office" | "cleaner">("cleaner");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [colorTag, setColorTag] = useState(COLOR_OPTIONS[0]);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(staffMember?.name ?? "");
      setRole(staffMember?.role ?? "cleaner");
      setEmail(staffMember?.email ?? "");
      setPhone(staffMember?.phone ?? "");
      setColorTag(staffMember?.colorTag ?? COLOR_OPTIONS[0]);
      setActive(staffMember?.active ?? true);
    }
  }, [open, staffMember]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = { name, role, email, phone, colorTag, active };
      if (isEdit) {
        return (await apiRequest("PATCH", `/api/staff/${staffMember!.id}`, payload)).json();
      }
      return (await apiRequest("POST", "/api/staff", payload)).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: isEdit ? "Staff member updated" : "Staff member added" });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Failed to save staff member", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-staff-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Staff Member" : "Add Staff Member"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-staff-name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground block mb-1">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger data-testid="select-staff-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="cleaner">Cleaner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground block mb-1">Calendar Color</Label>
              <div className="flex gap-1.5 pt-1.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColorTag(c)}
                    className={`h-6 w-6 rounded-full border-2 ${colorTag === c ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    data-testid={`button-color-${c}`}
                    aria-label={`Choose color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-staff-email" />
          </div>
          <div>
            <Label className="text-xs font-medium text-muted-foreground block mb-1">Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-staff-phone" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-staff">Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!name.trim() || save.isPending} data-testid="button-save-staff">
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
