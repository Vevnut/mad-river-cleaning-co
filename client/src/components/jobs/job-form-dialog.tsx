import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { InsertJob } from "@shared/schema";
import type { Property, JobTemplate, Staff, Job } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const JOB_TYPES = ["turnover", "deep_clean", "inspection", "one_time", "recurring", "custom"] as const;
const RECUR_FREQ = ["weekly", "biweekly", "monthly", "custom"] as const;

const formSchema = z.object({
  propertyId: z.coerce.number().min(1, "Select a property"),
  jobType: z.enum(JOB_TYPES),
  jobTemplateId: z.coerce.number().nullable().optional(),
  scheduledDate: z.string().min(1, "Date is required"),
  scheduledTime: z.string().min(1, "Time is required"),
  durationMinutes: z.coerce.number().min(15, "Duration must be at least 15 minutes"),
  assignedStaffId: z.coerce.number().nullable().optional(),
  price: z.coerce.number().min(0, "Price must be 0 or more"),
  internalNotes: z.string().nullable().optional(),
  customerNotes: z.string().nullable().optional(),
  isRecurring: z.boolean().default(false),
  recurFrequency: z.enum(RECUR_FREQ).default("weekly"),
});

type FormValues = z.infer<typeof formSchema>;

const DEFAULTS: FormValues = {
  propertyId: 0,
  jobType: "turnover",
  jobTemplateId: null,
  scheduledDate: new Date().toISOString().slice(0, 10),
  scheduledTime: "11:00",
  durationMinutes: 120,
  assignedStaffId: null,
  price: 0,
  internalNotes: "",
  customerNotes: "",
  isRecurring: false,
  recurFrequency: "weekly",
};

export function JobFormDialog({
  open,
  onOpenChange,
  initialDate,
  initialPropertyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDate?: string;
  initialPropertyId?: number;
  onCreated?: (job: Job) => void;
}) {
  const { toast } = useToast();

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    enabled: open,
  });
  const { data: templates = [] } = useQuery<JobTemplate[]>({
    queryKey: ["/api/job-templates"],
    enabled: open,
  });
  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey: ["/api/staff"],
    enabled: open,
  });

  // NOTE: zod v4 + z.coerce fields produce a resolver whose inferred input
  // type (pre-coercion) differs from FormValues (post-coercion) enough that
  // TS can't unify them structurally. Runtime validation is fully correct;
  // this cast only bridges the type-checker (see SCHEMA.md for the related
  // drizzle-zod note).
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: DEFAULTS,
  });

  useEffect(() => {
    if (open) {
      form.reset({
        ...DEFAULTS,
        scheduledDate: initialDate ?? DEFAULTS.scheduledDate,
        propertyId: initialPropertyId ?? 0,
      });
    }
  }, [open, initialDate, initialPropertyId]);

  const selectedPropertyId = form.watch("propertyId");
  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === Number(selectedPropertyId)),
    [properties, selectedPropertyId]
  );
  const isRecurring = form.watch("isRecurring");

  // Auto-fill price/duration/type when a template is chosen
  const handleTemplateChange = (templateId: string) => {
    const id = templateId === "none" ? null : Number(templateId);
    form.setValue("jobTemplateId", id);
    const template = templates.find((t) => t.id === id);
    if (template) {
      form.setValue("jobType", template.jobType as any);
      form.setValue("durationMinutes", template.defaultDurationMinutes);
      form.setValue("price", template.defaultPrice);
    }
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues): Promise<Job> => {
      const property = properties.find((p) => p.id === Number(values.propertyId));
      if (!property) throw new Error("Select a valid property");

      let scheduleId: number | null = null;
      if (values.isRecurring) {
        const scheduleRes = await apiRequest("POST", "/api/schedules", {
          propertyId: property.id,
          jobTemplateId: values.jobTemplateId ?? null,
          frequency: values.recurFrequency,
          dayOfWeek: new Date(values.scheduledDate + "T00:00:00").getDay(),
          startDate: values.scheduledDate,
          endDate: null,
          assignedStaffId: values.assignedStaffId ?? null,
          active: true,
        });
        const schedule = await scheduleRes.json();
        scheduleId = schedule.id;
      }

      const payload: InsertJob = {
        propertyId: property.id,
        customerId: property.customerId,
        scheduleId,
        jobTemplateId: values.jobTemplateId ?? null,
        jobType: values.isRecurring ? "recurring" : values.jobType,
        scheduledDate: values.scheduledDate,
        scheduledTime: values.scheduledTime,
        durationMinutes: values.durationMinutes,
        assignedStaffId: values.assignedStaffId ?? null,
        status: "scheduled",
        internalNotes: values.internalNotes || null,
        customerNotes: values.customerNotes || null,
        price: values.price,
        beforePhotos: "[]",
        afterPhotos: "[]",
        completedAt: null,
      };
      const res = await apiRequest("POST", "/api/jobs", payload);
      return res.json();
    },
    onSuccess: (job: Job) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/schedules"] });
      toast({ title: "Job scheduled" });
      onOpenChange(false);
      onCreated?.(job);
    },
    onError: (err: Error) => {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-job-form">
        <DialogHeader>
          <DialogTitle>New Job</DialogTitle>
          <DialogDescription>Schedule a cleaning job for a property.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="propertyId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Property *</FormLabel>
                  <Select onValueChange={field.onChange} value={String(field.value || "")}>
                    <FormControl>
                      <SelectTrigger data-testid="select-job-property">
                        <SelectValue placeholder="Select a property" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {properties.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedProperty && (
                    <FormDescription>
                      {selectedProperty.city}, {selectedProperty.state} &middot; base {selectedProperty.basePrice}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormItem>
                <FormLabel>Job Template</FormLabel>
                <Select onValueChange={handleTemplateChange} value={String(form.watch("jobTemplateId") ?? "none")}>
                  <FormControl>
                    <SelectTrigger data-testid="select-job-template">
                      <SelectValue placeholder="No template" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No template</SelectItem>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>

              <FormField
                control={form.control}
                name="jobType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-job-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {JOB_TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t.replace("_", " ")}
                          </SelectItem>
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
                name="scheduledDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-job-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="scheduledTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time *</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} data-testid="input-job-time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="durationMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duration (min) *</FormLabel>
                    <FormControl>
                      <Input type="number" step={15} {...field} data-testid="input-job-duration" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormItem>
                <FormLabel>Assigned Staff</FormLabel>
                <Select
                  onValueChange={(v) => form.setValue("assignedStaffId", v === "none" ? null : Number(v))}
                  value={String(form.watch("assignedStaffId") ?? "none")}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-job-staff">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {staffList.filter((s) => s.active).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price ($) *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} data-testid="input-job-price" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <FormField
                control={form.control}
                name="isRecurring"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel className="!mt-0">Recurring Job</FormLabel>
                      <FormDescription>Creates a recurring schedule rule for this property.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-job-recurring" />
                    </FormControl>
                  </FormItem>
                )}
              />
              {isRecurring && (
                <FormField
                  control={form.control}
                  name="recurFrequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-recur-frequency">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {RECUR_FREQ.map((f) => (
                            <SelectItem key={f} value={f} className="capitalize">{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="internalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal Notes</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} placeholder="Staff-only notes" data-testid="input-job-internal-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-job">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-job">
                {mutation.isPending ? "Scheduling..." : "Create Job"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
