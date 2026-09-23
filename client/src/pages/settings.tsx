import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Building2, FileText, ListChecks, Users, Bell } from "lucide-react";
import type { AppSettings, JobTemplate, Staff } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { JobTemplateDialog } from "@/components/settings/job-template-dialog";
import { StaffDialog } from "@/components/settings/staff-dialog";
import { formatMoney } from "@/lib/format";

export default function SettingsPage() {
  const { toast } = useToast();
  const { data: settings, isLoading: settingsLoading } = useQuery<AppSettings>({ queryKey: ["/api/settings"] });
  const { data: templates = [], isLoading: templatesLoading } = useQuery<JobTemplate[]>({ queryKey: ["/api/job-templates"] });
  const { data: staffList = [], isLoading: staffLoading } = useQuery<Staff[]>({ queryKey: ["/api/staff"] });

  // --- Business Info form state ---
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");

  // --- Invoice Settings form state ---
  const [defaultPaymentTermsDays, setDefaultPaymentTermsDays] = useState(15);
  const [invoiceNumberPrefix, setInvoiceNumberPrefix] = useState("INV");
  const [invoiceFooterNote, setInvoiceFooterNote] = useState("");

  // --- Notifications state ---
  const [notifyJobReminders, setNotifyJobReminders] = useState(true);
  const [notifyInvoiceOverdue, setNotifyInvoiceOverdue] = useState(true);
  const [notifyPaymentReceived, setNotifyPaymentReceived] = useState(true);
  const [notifyDailyDigest, setNotifyDailyDigest] = useState(false);

  useEffect(() => {
    if (settings) {
      setBusinessName(settings.businessName);
      setBusinessAddress(settings.businessAddress);
      setBusinessPhone(settings.businessPhone);
      setBusinessEmail(settings.businessEmail);
      setDefaultPaymentTermsDays(settings.defaultPaymentTermsDays);
      setInvoiceNumberPrefix(settings.invoiceNumberPrefix);
      setInvoiceFooterNote(settings.invoiceFooterNote);
      setNotifyJobReminders(settings.notifyJobReminders);
      setNotifyInvoiceOverdue(settings.notifyInvoiceOverdue);
      setNotifyPaymentReceived(settings.notifyPaymentReceived);
      setNotifyDailyDigest(settings.notifyDailyDigest);
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async (patch: Partial<AppSettings>) => (await apiRequest("PATCH", "/api/settings", patch)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings saved" });
    },
    onError: (err: Error) => toast({ title: "Failed to save settings", description: err.message, variant: "destructive" }),
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/job-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-templates"] });
      toast({ title: "Template deleted" });
    },
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/staff/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Staff member removed" });
    },
  });

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<JobTemplate | null>(null);
  const [staffDialogOpen, setStaffDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);

  const ROLE_LABEL: Record<string, string> = { admin: "Admin", office: "Office", cleaner: "Cleaner" };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold" data-testid="text-page-title">Settings</h1>

      <Tabs defaultValue="business" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="services">Services & Add-ons</TabsTrigger>
          <TabsTrigger value="billing-setup">Payments & Access</TabsTrigger>
          <TabsTrigger value="business" className="gap-1.5" data-testid="tab-business-info">
            <Building2 className="h-3.5 w-3.5" /> Business Info
          </TabsTrigger>
          <TabsTrigger value="invoicing" className="gap-1.5" data-testid="tab-invoice-settings">
            <FileText className="h-3.5 w-3.5" /> Invoice Settings
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5" data-testid="tab-job-templates">
            <ListChecks className="h-3.5 w-3.5" /> Job Type Templates
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-1.5" data-testid="tab-staff-roles">
            <Users className="h-3.5 w-3.5" /> Staff &amp; Roles
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-1.5" data-testid="tab-notifications">
            <Bell className="h-3.5 w-3.5" /> Notifications
          </TabsTrigger>
        </TabsList>
        <TabsContent value="services" className="mt-4"><ServiceSettings /></TabsContent>
        <TabsContent value="billing-setup" className="mt-4"><BillingSetup /></TabsContent>

        {/* Business Info */}
        <TabsContent value="business" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Business Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-w-lg">
              {settingsLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed text-muted-foreground text-[10px] text-center shrink-0" data-testid="placeholder-business-logo">
                      Logo
                    </div>
                    <p className="text-xs text-muted-foreground">Real logo upload is a future roadmap item (see ROADMAP.md).</p>
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground block mb-1">Business Name</Label>
                    <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} data-testid="input-business-name" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground block mb-1">Address</Label>
                    <Input value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} data-testid="input-business-address" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground block mb-1">Phone</Label>
                      <Input value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)} data-testid="input-business-phone" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground block mb-1">Email</Label>
                      <Input type="email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)} data-testid="input-business-email" />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => saveSettings.mutate({ businessName, businessAddress, businessPhone, businessEmail })}
                    disabled={saveSettings.isPending}
                    data-testid="button-save-business-info"
                  >
                    Save Business Info
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoice Settings */}
        <TabsContent value="invoicing" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Invoice Settings</CardTitle>
              <p className="text-xs text-muted-foreground">These defaults are applied automatically to every new invoice.</p>
            </CardHeader>
            <CardContent className="space-y-3 max-w-lg">
              {settingsLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground block mb-1">Payment Terms (days)</Label>
                    <Input type="number" min={0} value={defaultPaymentTermsDays} onChange={(e) => setDefaultPaymentTermsDays(Number(e.target.value))} data-testid="input-payment-terms" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground block mb-1">Invoice Number Prefix</Label>
                    <Input value={invoiceNumberPrefix} onChange={(e) => setInvoiceNumberPrefix(e.target.value)} data-testid="input-invoice-prefix" />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-muted-foreground block mb-1">Footer Note</Label>
                    <Textarea value={invoiceFooterNote} onChange={(e) => setInvoiceFooterNote(e.target.value)} rows={2} data-testid="textarea-invoice-footer" />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => saveSettings.mutate({
                      defaultTaxRate: 0,
                      defaultPaymentTermsDays,
                      invoiceNumberPrefix,
                      invoiceFooterNote,
                    })}
                    disabled={saveSettings.isPending}
                    data-testid="button-save-invoice-settings"
                  >
                    Save Invoice Settings
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Job Type Templates */}
        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">Job Type Templates</CardTitle>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditingTemplate(null); setTemplateDialogOpen(true); }} data-testid="button-new-job-template">
                <Plus className="h-3.5 w-3.5" /> New Template
              </Button>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-job-templates">No job templates yet.</p>
              ) : (
                <ul className="space-y-2">
                  {templates.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 rounded-md border p-3" data-testid={`row-job-template-${t.id}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{t.name}</p>
                          <Badge variant="outline" className="capitalize text-[10px]">{t.jobType.replace("_", " ")}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t.defaultDurationMinutes} min &middot; {formatMoney(t.defaultPrice)} &middot; {JSON.parse(t.defaultChecklist).length} checklist items
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingTemplate(t); setTemplateDialogOpen(true); }} data-testid={`button-edit-template-${t.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteTemplate.mutate(t.id)} data-testid={`button-delete-template-${t.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Staff & Roles */}
        <TabsContent value="staff" className="mt-4">
          <Card>
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">Staff &amp; Roles</CardTitle>
              <Button size="sm" className="gap-1.5" onClick={() => { setEditingStaff(null); setStaffDialogOpen(true); }} data-testid="button-new-staff">
                <Plus className="h-3.5 w-3.5" /> New Staff Member
              </Button>
            </CardHeader>
            <CardContent>
              {staffLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : staffList.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center" data-testid="empty-staff-list">No staff members yet.</p>
              ) : (
                <ul className="space-y-2">
                  {staffList.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-3" data-testid={`row-staff-${s.id}`}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.colorTag }} data-testid={`swatch-staff-${s.id}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate max-w-full">{s.name}</p>
                            <Badge variant="outline" className="text-[10px] shrink-0">{ROLE_LABEL[s.role]}</Badge>
                            {!s.active && <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">Inactive</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{s.email} &middot; {s.phone}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingStaff(s); setStaffDialogOpen(true); }} data-testid={`button-edit-staff-${s.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteStaff.mutate(s.id)} data-testid={`button-delete-staff-${s.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notifications</CardTitle>
              <p className="text-xs text-muted-foreground">Static preview for now — automated delivery ships in a later phase (see ROADMAP.md).</p>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Job reminders</p>
                  <p className="text-xs text-muted-foreground">Notify staff before an upcoming scheduled job.</p>
                </div>
                <Switch checked={notifyJobReminders} onCheckedChange={(v) => { setNotifyJobReminders(v); saveSettings.mutate({ notifyJobReminders: v }); }} data-testid="switch-notify-job-reminders" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Overdue invoice alerts</p>
                  <p className="text-xs text-muted-foreground">Notify office staff when an invoice becomes overdue.</p>
                </div>
                <Switch checked={notifyInvoiceOverdue} onCheckedChange={(v) => { setNotifyInvoiceOverdue(v); saveSettings.mutate({ notifyInvoiceOverdue: v }); }} data-testid="switch-notify-overdue" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Payment received</p>
                  <p className="text-xs text-muted-foreground">Notify when a payment is recorded against an invoice.</p>
                </div>
                <Switch checked={notifyPaymentReceived} onCheckedChange={(v) => { setNotifyPaymentReceived(v); saveSettings.mutate({ notifyPaymentReceived: v }); }} data-testid="switch-notify-payment" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Daily digest</p>
                  <p className="text-xs text-muted-foreground">A daily summary email of jobs and invoices.</p>
                </div>
                <Switch checked={notifyDailyDigest} onCheckedChange={(v) => { setNotifyDailyDigest(v); saveSettings.mutate({ notifyDailyDigest: v }); }} data-testid="switch-notify-digest" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <JobTemplateDialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen} template={editingTemplate} />
      <StaffDialog open={staffDialogOpen} onOpenChange={setStaffDialogOpen} staffMember={editingStaff} />
    </div>
  );
}
import { ServiceSettings, BillingSetup } from "@/components/service-settings";
