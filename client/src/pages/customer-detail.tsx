import { useState } from "react";
import { useParams, Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Building2, Mail, Phone, MapPin, Plus, Home, ClipboardList,
  Receipt, UserSquare2, Pencil, ShieldCheck,
} from "lucide-react";
import type { Customer, Property, Contact } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { PropertyFormDialog } from "@/components/properties/property-form-dialog";
import { NotesPanel } from "@/components/notes-panel";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = Number(params.id);
  const { toast } = useToast();

  const [editOpen, setEditOpen] = useState(false);
  const [propertyFormOpen, setPropertyFormOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/customers/${customerId}`);
      return res.json();
    },
  });

  const { data: properties = [], isLoading: loadingProperties } = useQuery<Property[]>({
    queryKey: ["/api/properties", { customerId }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/properties?customerId=${customerId}`);
      return res.json();
    },
  });

  const { data: contacts = [], isLoading: loadingContacts } = useQuery<Contact[]>({
    queryKey: ["/api/contacts", customerId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/contacts?customerId=${customerId}`);
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Customer not found.</p>
        <Link href="/customers" className="text-sm text-primary hover:underline">
          Back to Customers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <Link href="/customers">
          <Button size="icon" variant="ghost" data-testid="button-back-customers">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-xl font-semibold flex-1 truncate" data-testid="text-customer-name">
          {customer.name}
        </h1>
        <Badge variant="secondary" className="capitalize">{customer.customerType}</Badge>
        {customer.taxExempt && (
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="h-3 w-3" /> Tax Exempt
          </Badge>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditOpen(true)} data-testid="button-edit-customer">
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="properties" data-testid="tab-properties">Properties</TabsTrigger>
          <TabsTrigger value="jobs" data-testid="tab-jobs">Job History</TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">Invoice History</TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts">Contacts</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Contact Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span data-testid="text-customer-email">{customer.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="tabular-nums" data-testid="text-customer-phone">{customer.phone}</span>
                </div>
                {customer.altPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="tabular-nums">{customer.altPhone} (alt)</span>
                  </div>
                )}
                {customer.companyName && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{customer.companyName}</span>
                  </div>
                )}
                <div className="pt-1">
                  <p className="text-xs text-muted-foreground">Preferred contact method</p>
                  <Badge variant="secondary" className="capitalize mt-1">{customer.preferredContact}</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Billing Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p data-testid="text-billing-address">{customer.billingAddressLine1}</p>
                    {customer.billingAddressLine2 && <p>{customer.billingAddressLine2}</p>}
                    <p>
                      {customer.billingCity}, {customer.billingState} {customer.billingZip}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <NotesPanel customerId={customerId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setPropertyFormOpen(true)} data-testid="button-add-property">
              <Plus className="h-4 w-4" /> Add Property
            </Button>
          </div>
          {loadingProperties ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          ) : properties.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border py-12 text-center" data-testid="empty-properties">
              <Home className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No properties linked to this customer yet.</p>
              <Button size="sm" variant="outline" onClick={() => setPropertyFormOpen(true)} data-testid="button-empty-add-property">
                Add Property
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {properties.map((p) => (
                <Link key={p.id} href={`/properties/${p.id}`}>
                  <Card className="hover-elevate cursor-pointer" data-testid={`card-property-${p.id}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{p.name}</p>
                        <Badge variant="outline" className="capitalize">{p.unitType}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {p.addressLine1}, {p.city}, {p.state}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{p.bedrooms} bd</span>
                        <span>{p.bathrooms} ba</span>
                        <span className="capitalize">{p.cleaningFrequency}</span>
                        <span className="tabular-nums">{formatMoney(p.basePrice)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="jobs">
          <div className="flex flex-col items-center gap-2 rounded-md border py-12 text-center" data-testid="empty-job-history">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No job history yet. Jobs will appear here once Scheduling/Jobs launches in Phase 2.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="invoices">
          <div className="flex flex-col items-center gap-2 rounded-md border py-12 text-center" data-testid="empty-invoice-history">
            <Receipt className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No invoices yet. Invoicing launches in Phase 3.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setContactFormOpen(true)} data-testid="button-add-contact">
              <Plus className="h-4 w-4" /> Add Contact
            </Button>
          </div>
          {loadingContacts ? (
            <Skeleton className="h-16 w-full" />
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border py-12 text-center" data-testid="empty-contacts">
              <UserSquare2 className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No additional contacts yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="font-medium text-sm flex items-center gap-2">
                        {contact.name}
                        {contact.isPrimary && <Badge variant="secondary">Primary</Badge>}
                      </p>
                      {contact.role && <p className="text-xs text-muted-foreground">{contact.role}</p>}
                      <p className="text-xs text-muted-foreground">{contact.email} · {contact.phone}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} />
      <PropertyFormDialog
        open={propertyFormOpen}
        onOpenChange={setPropertyFormOpen}
        defaultCustomerId={customerId}
      />
      <ContactFormDialog
        open={contactFormOpen}
        onOpenChange={setContactFormOpen}
        customerId={customerId}
      />
    </div>
  );
}

function ContactFormDialog({
  open,
  onOpenChange,
  customerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: number;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/contacts", {
        customerId,
        name,
        role: role || null,
        email,
        phone,
        isPrimary,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", customerId] });
      toast({ title: "Contact added" });
      setName("");
      setRole("");
      setEmail("");
      setPhone("");
      setIsPrimary(false);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't add contact", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-contact-form">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>Add an additional contact for this customer.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="contact-name">Name *</Label>
            <Input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-contact-name" />
          </div>
          <div>
            <Label htmlFor="contact-role">Role</Label>
            <Input id="contact-role" placeholder="e.g. Property Manager" value={role} onChange={(e) => setRole(e.target.value)} data-testid="input-contact-role" />
          </div>
          <div>
            <Label htmlFor="contact-email">Email *</Label>
            <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-contact-email" />
          </div>
          <div>
            <Label htmlFor="contact-phone">Phone *</Label>
            <Input id="contact-phone" value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-contact-phone" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-contact">
            Cancel
          </Button>
          <Button
            disabled={!name || !email || !phone || mutation.isPending}
            onClick={() => mutation.mutate()}
            data-testid="button-submit-contact"
          >
            {mutation.isPending ? "Saving..." : "Add Contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
