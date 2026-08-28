import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InsertStay, Property, Stay } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export const PLATFORMS = ["airbnb", "vrbo", "booking_com", "direct", "other"] as const;
export const PLATFORM_LABELS: Record<(typeof PLATFORMS)[number], string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  booking_com: "Booking.com",
  direct: "Direct / Owner",
  other: "Other",
};

function addDaysISO(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const formSchema = z.object({
  propertyId: z.coerce.number().min(1, "Select a property"),
  guestName: z.string().min(1, "Guest name is required"),
  guestPhone: z.string().nullable().optional(),
  guestCount: z.coerce.number().nullable().optional(),
  platform: z.enum(PLATFORMS),
  checkInDate: z.string().min(1, "Check-in date is required"),
  checkOutDate: z.string().min(1, "Check-out date is required"),
  status: z.enum(["confirmed", "tentative", "canceled"]),
  notes: z.string().nullable().optional(),
}).refine((v) => v.checkOutDate > v.checkInDate, {
  message: "Check-out must be after check-in",
  path: ["checkOutDate"],
});

type FormValues = z.infer<typeof formSchema>;

function defaults(initialDate?: string, initialPropertyId?: number): FormValues {
  const checkIn = initialDate ?? new Date().toISOString().slice(0, 10);
  return {
    propertyId: initialPropertyId ?? 0,
    guestName: "",
    guestPhone: "",
    guestCount: null,
    platform: "airbnb",
    checkInDate: checkIn,
    checkOutDate: addDaysISO(checkIn, 3),
    status: "confirmed",
    notes: "",
  };
}

export function StayFormDialog({
  open,
  onOpenChange,
  initialDate,
  initialPropertyId,
  editStay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  initialPropertyId?: number;
  editStay?: Stay | null;
}) {
  const { toast } = useToast();
  const isEdit = !!editStay;
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    enabled: open,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (!open) return;
    if (editStay) {
      form.reset({
        propertyId: editStay.propertyId,
        guestName: editStay.guestName,
        guestPhone: editStay.guestPhone ?? "",
        guestCount: editStay.guestCount ?? null,
        platform: editStay.platform as any,
        checkInDate: editStay.checkInDate,
        checkOutDate: editStay.checkOutDate,
        status: editStay.status as any,
        notes: editStay.notes ?? "",
      });
    } else {
      form.reset(defaults(initialDate, initialPropertyId));
    }
  }, [open, editStay, initialDate, initialPropertyId]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormValues): Promise<Stay> => {
      const payload: InsertStay = {
        propertyId: Number(values.propertyId),
        guestName: values.guestName,
        guestPhone: values.guestPhone || null,
        guestCount: values.guestCount || null,
        platform: values.platform,
        checkInDate: values.checkInDate,
        checkOutDate: values.checkOutDate,
        status: values.status,
        notes: values.notes || null,
      };
      const res = isEdit
        ? await apiRequest("PATCH", `/api/stays/${editStay!.id}`, payload)
        : await apiRequest("POST", "/api/stays", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stays"] });
      toast({ title: isEdit ? "Stay updated" : "Stay added" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/stays/${editStay!.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stays"] });
      toast({ title: "Stay deleted" });
      setConfirmDeleteOpen(false);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't delete stay", description: err.message, variant: "destructive" });
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-stay-form">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Stay" : "New Stay"}</DialogTitle>
            <DialogDescription>
              Track a guest booking so turnover cleanings can be planned around check-out.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="propertyId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property *</FormLabel>
                    <Select onValueChange={field.onChange} value={String(field.value || "")}>
                      <FormControl>
                        <SelectTrigger data-testid="select-stay-property">
                          <SelectValue placeholder="Select a property" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {properties.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="guestName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guest Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Jane Doe" data-testid="input-stay-guest-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platform *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-stay-platform">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {PLATFORMS.map((p) => (
                            <SelectItem key={p} value={p}>{PLATFORM_LABELS[p]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="checkInDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check-in *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-stay-checkin" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="checkOutDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Check-out *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-stay-checkout" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="guestCount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guests</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}
                          data-testid="input-stay-guest-count"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="guestPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Guest Phone</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? ""} placeholder="Optional" data-testid="input-stay-guest-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-stay-status">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="tentative">Tentative</SelectItem>
                          <SelectItem value="canceled">Canceled</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value ?? ""}
                        placeholder="Access notes, special requests, etc."
                        rows={2}
                        data-testid="input-stay-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="gap-2 sm:justify-between">
                {isEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive gap-1.5 sm:mr-auto"
                    onClick={() => setConfirmDeleteOpen(true)}
                    data-testid="button-delete-stay"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                ) : <span />}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-stay">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending} data-testid="button-submit-stay">
                    {saveMutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Add Stay"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent data-testid="dialog-confirm-delete-stay">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this stay?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {editStay?.guestName ?? "the guest"}'s booking from the calendar. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              data-testid="button-confirm-delete-stay"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
