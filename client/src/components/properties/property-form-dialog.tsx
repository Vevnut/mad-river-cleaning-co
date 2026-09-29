import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertPropertySchema } from "@shared/schema";
import type { Property, Customer } from "@shared/schema";
import { BED_TYPES, totalBeds } from "@shared/beds";
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
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const formSchema = insertPropertySchema.extend({
  name: z.string().min(1, "Property name is required"),
  customerId: z.number({ message: "Select a customer" }).min(1, "Select a customer"),
  addressLine1: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(2, "State is required"),
  zip: z.string().min(5, "ZIP is required"),
  unitType: z.enum(["house", "condo", "cabin", "apartment", "cottage"]),
  cleaningFrequency: z.enum(["weekly", "biweekly", "monthly", "turnover", "one_time"]),
  entryInstructions: z.string().min(1, "Entry instructions are required"),
  bedrooms: z.number().min(0),
  bathrooms: z.number().min(0),
  maxOccupancy: z.number().min(1),
  basePrice: z.number().min(0),
});

type FormValues = z.infer<typeof formSchema>;

function defaults(customerId?: number): FormValues {
  return {
    customerId: customerId ?? 0,
    name: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "NH",
    zip: "",
    unitType: "house",
    bedrooms: 1,
    bathrooms: 1,
    bedKing: 0, bedQueen: 0, bedFull: 0, bedTwin: 0, bedBunk: 0, bedSofa: 0,
    fullBathrooms: 1,
    halfBathrooms: 0,
    standardDepartureRate: null,
    standardDepartureRateName: "Standard Departure Cleaning",
    ownerRate: null,
    ownerRateName: "Owner Departure Cleaning",
    invoiceNotes: "",
    maxOccupancy: 2,
    checkInTime: "16:00",
    checkOutTime: "10:00",
    entryInstructions: "",
    accessNotes: "",
    supplyNotes: "",
    cleaningFrequency: "turnover",
    basePrice: 0,
    photoUrl: null,
    active: true,
  };
}

export function PropertyFormDialog({
  open,
  onOpenChange,
  property,
  defaultCustomerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property?: Property | null;
  defaultCustomerId?: number;
}) {
  const { toast } = useToast();
  const isEdit = !!property;

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaults(defaultCustomerId),
  });
  const [bedKing, bedQueen, bedFull, bedTwin, bedBunk, bedSofa] = form.watch(["bedKing", "bedQueen", "bedFull", "bedTwin", "bedBunk", "bedSofa"]);
  const watchedBeds = { bedKing, bedQueen, bedFull, bedTwin, bedBunk, bedSofa };

  useEffect(() => {
    if (open) {
      form.reset(
        property
          ? {
              customerId: property.customerId,
              name: property.name,
              addressLine1: property.addressLine1,
              addressLine2: property.addressLine2 ?? "",
              city: property.city,
              state: property.state,
              zip: property.zip,
              unitType: property.unitType,
              bedrooms: property.bedrooms,
              bathrooms: property.bathrooms,
              bedKing: property.bedKing ?? 0, bedQueen: property.bedQueen ?? 0, bedFull: property.bedFull ?? 0,
              bedTwin: property.bedTwin ?? 0, bedBunk: property.bedBunk ?? 0, bedSofa: property.bedSofa ?? 0,
              fullBathrooms: property.fullBathrooms ?? Math.floor(property.bathrooms),
              halfBathrooms: property.halfBathrooms ?? ((property.bathrooms % 1) === 0.5 ? 1 : 0),
              standardDepartureRate: property.standardDepartureRate,
              standardDepartureRateName: property.standardDepartureRateName || "Standard Departure Cleaning",
              ownerRate: property.ownerRate,
              ownerRateName: property.ownerRateName || "Owner Departure Cleaning",
              invoiceNotes: property.invoiceNotes || "",
              maxOccupancy: property.maxOccupancy,
              checkInTime: property.checkInTime,
              checkOutTime: property.checkOutTime,
              entryInstructions: property.entryInstructions,
              accessNotes: property.accessNotes ?? "",
              supplyNotes: property.supplyNotes ?? "",
              cleaningFrequency: property.cleaningFrequency,
              basePrice: property.basePrice,
              photoUrl: property.photoUrl,
              active: property.active,
            }
          : defaults(defaultCustomerId)
      );
    }
  }, [open, property, defaultCustomerId]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        ...values,
        addressLine2: values.addressLine2 || null,
        accessNotes: values.accessNotes || null,
        supplyNotes: values.supplyNotes || null,
      };
      if (isEdit && property) {
        const res = await apiRequest("PATCH", `/api/properties/${property.id}`, payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/properties", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/properties"] });
      toast({ title: isEdit ? "Property updated" : "Property created" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Something went wrong", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-property-form">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Property" : "New Property"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update property details." : "Add a property under a customer."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer *</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(Number(v))}
                      value={field.value ? String(field.value) : undefined}
                      disabled={isEdit}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-property-customer">
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Property Name *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-property-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="addressLine1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 1 *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-property-address1" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="addressLine2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} data-testid="input-property-address2" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-property-city" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-property-state" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="zip"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ZIP *</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-property-zip" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="unitType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit Type *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-unit-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="house">House</SelectItem>
                        <SelectItem value="condo">Condo</SelectItem>
                        <SelectItem value="cabin">Cabin</SelectItem>
                        <SelectItem value="apartment">Apartment</SelectItem>
                        <SelectItem value="cottage">Cottage</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bedrooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bedrooms *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={0}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        data-testid="input-bedrooms"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="fullBathrooms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full bathrooms</FormLabel>
                    <FormControl>
                      <Input
                        {...field} value={field.value ?? 0}
                        type="number"
                        min={0}
                        step={1}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        data-testid="input-bathrooms"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField control={form.control} name="halfBathrooms" render={({ field }) => (
                <FormItem><FormLabel>Half bathrooms</FormLabel><FormControl>
                  <Input {...field} value={field.value ?? 0} type="number" min={0} step={1} onChange={e => field.onChange(e.target.valueAsNumber)} />
                </FormControl><FormMessage /></FormItem>
              )} />
              <FormField
                control={form.control}
                name="maxOccupancy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Occupancy *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                        data-testid="input-max-occupancy"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-md border p-3 space-y-3" data-testid="section-property-beds">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Beds</p>
                <p className="text-xs text-muted-foreground tabular-nums" data-testid="text-bed-total">
                  {totalBeds(watchedBeds) === 1 ? "1 bed" : `${totalBeds(watchedBeds)} beds`}
                </p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {BED_TYPES.map((t) => (
                  <FormField key={t.key} control={form.control} name={t.key} render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-normal text-muted-foreground">{t.label}</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value ?? 0} type="number" min={0} max={50} step={1} inputMode="numeric"
                          onChange={(e) => field.onChange(Number.isNaN(e.target.valueAsNumber) ? 0 : e.target.valueAsNumber)}
                          data-testid={`input-${t.key}`} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="checkInTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Check-in Time *</FormLabel>
                    <FormControl>
                      <Input {...field} type="time" data-testid="input-checkin-time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="checkOutTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Checkout Time *</FormLabel>
                    <FormControl>
                      <Input {...field} type="time" data-testid="input-checkout-time" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cleaningFrequency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Frequency *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-cleaning-frequency">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="turnover">Turnover</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="biweekly">Biweekly</SelectItem>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="one_time">One Time</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="standardDepartureRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Standard rate ($)</FormLabel>
                    <FormControl>
                      <Input
                        {...field} value={field.value ?? ""}
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="No default"
                        onChange={(e) => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)}
                        data-testid="input-base-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField control={form.control} name="standardDepartureRateName" render={({ field }) => <FormItem><FormLabel>Standard rate label</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="ownerRate" render={({ field }) => <FormItem><FormLabel>Owner rate ($)</FormLabel><FormControl><Input {...field} value={field.value ?? ""} type="number" step=".01" min="0" placeholder="No default" onChange={e => field.onChange(e.target.value === "" ? null : e.target.valueAsNumber)} /></FormControl><FormMessage /></FormItem>} />
              <FormField control={form.control} name="ownerRateName" render={({ field }) => <FormItem><FormLabel>Owner rate label</FormLabel><FormControl><Input {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />
            </div>
            <p className="text-xs text-muted-foreground">Leave a rate blank to skip its default charge. Only the selected rate is added to an invoice. Bathroom total: {(form.watch("fullBathrooms") || 0) + (form.watch("halfBathrooms") || 0) * 0.5}.</p>
            <FormField control={form.control} name="invoiceNotes" render={({ field }) => <FormItem><FormLabel>Default invoice notes / client message</FormLabel><FormControl><Textarea {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>} />

            <FormField
              control={form.control}
              name="entryInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entry Instructions * <span className="text-xs text-muted-foreground">(gate codes, lockbox, keys — sensitive)</span></FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} data-testid="textarea-entry-instructions" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accessNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Access Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="textarea-access-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="supplyNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supply Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ""} rows={2} data-testid="textarea-supply-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border p-3">
                  <FormLabel className="!mt-0">Active</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-property-active" />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-property">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} data-testid="button-submit-property">
                {mutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Property"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
