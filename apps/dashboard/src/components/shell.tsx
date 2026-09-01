"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Clock, Database, Globe, LogOut, Menu, Package, Search, Zap } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/breadcrumbs";
import { GlobalSearch } from "@/components/global-search";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { OrgSwitcher } from "@/components/org-switcher";
import { useSearch } from "@/components/search-provider";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { clearToken } from "@/lib/api";
import { formatStatus } from "@/lib/format";

export function DashboardShell({
  children,
  breadcrumbs = [],
}: {
  children: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}) {
  const router = useRouter();
  const { setOpen: setSearchOpen } = useSearch();
  const [mobileOpen, setMobileOpen] = useState(false);

  function logout() {
    clearToken();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen">
      <GlobalSearch />
      <div className="hidden md:block">
        <AppSidebar />
      </div>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card/50 px-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <AppSidebar onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="min-w-0 truncate">
              <Breadcrumbs items={breadcrumbs} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <OrgSwitcher />
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 sm:inline-flex"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-4 w-4" />
              <span className="text-muted-foreground">Search</span>
              <kbd className="hidden rounded border border-border px-1.5 text-xs lg:inline">/</kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </Button>
            <KeyboardShortcuts />
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "running" || status === "online" || status === "success"
      ? "success"
      : status === "failed" || status === "offline"
        ? "danger"
        : "warning";

  const className =
    variant === "success"
      ? "inline-flex items-center rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400"
      : variant === "danger"
        ? "inline-flex items-center rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-medium text-red-400"
        : "inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400";

  return <span className={className}>{formatStatus(status)}</span>;
}

const SERVICE_ICON_CLASS = "h-5 w-5";

export function ServiceIcon({ type, className }: { type: string; className?: string }) {
  const iconClass = cn(SERVICE_ICON_CLASS, className);
  switch (type) {
    case "web":
      return <Globe className={cn(iconClass, "text-blue-400")} />;
    case "postgres":
      return <Database className={cn(iconClass, "text-sky-400")} />;
    case "redis":
      return <Zap className={cn(iconClass, "text-yellow-400")} />;
    case "storage":
      return <Package className={cn(iconClass, "text-purple-400")} />;
    case "cron":
      return <Clock className={cn(iconClass, "text-orange-400")} />;
    default:
      return <Box className={cn(iconClass, "text-muted-foreground")} />;
  }
}

/** @deprecated Use DashboardShell with breadcrumbs instead */
export function Shell({ children }: { children: ReactNode; title?: string }) {
  return <DashboardShell>{children}</DashboardShell>;
}

export type { BreadcrumbItem };
