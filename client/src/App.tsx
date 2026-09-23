import { useState } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { ThemeProvider } from "@/components/theme-provider";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import { PropertyFormDialog } from "@/components/properties/property-form-dialog";
import NotFound from "@/pages/not-found";
import DashboardPage from "@/pages/dashboard";
import CustomersListPage from "@/pages/customers-list";
import CustomerDetailPage from "@/pages/customer-detail";
import PropertiesListPage from "@/pages/properties-list";
import PropertyDetailPage from "@/pages/property-detail";
import SchedulingPage from "@/pages/scheduling";
import StaysPage from "@/pages/stays";
import JobsListPage from "@/pages/jobs-list";
import JobDetailPage from "@/pages/job-detail";
import InvoicesListPage from "@/pages/invoices-list";
import InvoiceDetailPage from "@/pages/invoice-detail";
import InvoiceNewPage from "@/pages/invoice-new";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import { AuthGate } from "@/components/auth-gate";
import PublicInvoicePage from "@/pages/public-invoice";

function AppRouter({
  onNewCustomer,
  onNewProperty,
}: {
  onNewCustomer: () => void;
  onNewProperty: () => void;
}) {
  return (
    <Switch>
      <Route path="/">
        <DashboardPage onNewCustomer={onNewCustomer} onNewProperty={onNewProperty} />
      </Route>
      <Route path="/customers" component={CustomersListPage} />
      <Route path="/customers/:id" component={CustomerDetailPage} />
      <Route path="/properties" component={PropertiesListPage} />
      <Route path="/properties/:id" component={PropertyDetailPage} />
      <Route path="/scheduling" component={SchedulingPage} />
      <Route path="/stays" component={StaysPage} />
      <Route path="/jobs" component={JobsListPage} />
      <Route path="/jobs/:id" component={JobDetailPage} />
      <Route path="/invoices/new" component={InvoiceNewPage} />
      <Route path="/invoices/:id/edit" component={InvoiceNewPage} />
      <Route path="/invoices/:id" component={InvoiceDetailPage} />
      <Route path="/invoices" component={InvoicesListPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newPropertyOpen, setNewPropertyOpen] = useState(false);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Router hook={useHashLocation}>
            <Switch>
              <Route path="/pay/:token" component={PublicInvoicePage} />
              <Route><AuthGate>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full overflow-hidden">
                <AppSidebar />
                <div className="flex flex-1 flex-col overflow-hidden">
                  <AppHeader
                    onNewCustomer={() => setNewCustomerOpen(true)}
                    onNewProperty={() => setNewPropertyOpen(true)}
                  />
                  <main className="flex-1 overflow-y-auto" style={{ overscrollBehavior: "contain" }}>
                    <AppRouter
                      onNewCustomer={() => setNewCustomerOpen(true)}
                      onNewProperty={() => setNewPropertyOpen(true)}
                    />
                  </main>
                </div>
              </div>
            </SidebarProvider>
            <CustomerFormDialog open={newCustomerOpen} onOpenChange={setNewCustomerOpen} />
            <PropertyFormDialog open={newPropertyOpen} onOpenChange={setNewPropertyOpen} />
            </AuthGate></Route>
            </Switch>
          </Router>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
