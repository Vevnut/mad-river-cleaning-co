import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { requestExpense } from "@/pages/expenses";
import { Search, Sun, Moon, Plus, ChevronDown } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTheme } from "@/components/theme-provider";
import { GlobalSearchDialog } from "@/components/global-search";
import { apiRequest, setSessionToken, queryClient } from "@/lib/queryClient";

interface AppHeaderProps {
  onNewCustomer: () => void;
  onNewProperty: () => void;
}

export function AppHeader({ onNewCustomer, onNewProperty }: AppHeaderProps) {
  const { theme, toggleTheme } = useTheme();
  const [role, setRole] = useState("Admin");
  const [searchOpen, setSearchOpen] = useState(false);
  const [, navigate] = useLocation();

  // Cmd/Ctrl+K opens the global search command palette.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="flex items-center gap-3 border-b bg-background px-4 py-2 sticky top-0 z-10">
      <SidebarTrigger data-testid="button-sidebar-toggle" />

      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      <button
        onClick={() => setSearchOpen(true)}
        className="flex-1 min-w-0 max-w-md h-9 flex items-center gap-2 pl-2.5 pr-2 rounded-md border bg-muted/40 text-sm text-muted-foreground hover:text-foreground hover-elevate transition-colors"
        aria-label="Open global search"
        data-testid="input-global-search"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search customers, properties, jobs, invoices...</span>
        <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono text-muted-foreground/70 shrink-0">
          <span className="px-1 py-0.5 rounded border bg-background">⌘K</span>
        </kbd>
      </button>

      <div className="flex shrink-0 items-center gap-2 ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1" data-testid="button-quick-action">
              <Plus className="h-4 w-4" />
              New
              <ChevronDown className="h-3 w-3 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="menuitem-new-customer" onClick={onNewCustomer}>
              New Customer
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="menuitem-new-property" onClick={onNewProperty}>
              New Property
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="menuitem-new-job" onClick={() => navigate("/scheduling")}>
              New Job
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="menuitem-new-invoice" onClick={() => navigate("/invoices/new")}>
              New Invoice
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="menuitem-add-gas" onClick={() => requestExpense("mileage", navigate)}>
              Add Gas
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="menuitem-new-expense" onClick={() => requestExpense("supply", navigate)}>
              Supply Cost
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="sm" onClick={async () => { await apiRequest("POST", "/api/logout"); setSessionToken(""); queryClient.clear(); window.location.reload(); }}>Sign out</Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          data-testid="button-theme-toggle"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
}
