import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, Users, Home, CalendarDays, ClipboardList,
  Receipt, BarChart3, Settings,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { MadRiverLogo } from "@/components/logo";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, testId: "dashboard" },
  { title: "Customers", url: "/customers", icon: Users, testId: "customers" },
  { title: "Properties", url: "/properties", icon: Home, testId: "properties" },
  { title: "Scheduling", url: "/scheduling", icon: CalendarDays, testId: "scheduling" },
  { title: "Jobs", url: "/jobs", icon: ClipboardList, testId: "jobs" },
  { title: "Invoices", url: "/invoices", icon: Receipt, testId: "invoices" },
  { title: "Reports", url: "/reports", icon: BarChart3, testId: "reports" },
  { title: "Settings", url: "/settings", icon: Settings, testId: "settings" },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="px-3 py-3">
        <MadRiverLogo className="flex items-center gap-2 px-1" />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operations</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  item.url === "/" ? location === "/" : location.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} data-testid={`link-nav-${item.testId}`}>
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-3 py-3">
        <p className="text-xs text-muted-foreground px-1">Mad River Cleaning Co.</p>
      </SidebarFooter>
    </Sidebar>
  );
}
