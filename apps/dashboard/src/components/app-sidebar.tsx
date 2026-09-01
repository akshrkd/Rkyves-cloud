"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cloud, FolderKanban, HardDrive, LayoutDashboard, Plug, Settings, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
  { href: "/dashboard/workers", label: "Workers", icon: HardDrive },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
  { href: "/dashboard/settings/integrations", label: "Integrations", icon: Plug },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    if (href === "/dashboard/settings") {
      return pathname === href;
    }
    if (href === "/dashboard/settings/integrations") {
      return pathname.startsWith("/dashboard/settings/integrations");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <Cloud className="h-6 w-6 text-primary" />
        <Link href="/dashboard" className="text-lg font-bold" onClick={onNavigate}>
          Rkyves Cloud
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const active = isActive(item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          Internal PaaS for deploying and managing Rkyves applications.
        </p>
      </div>
    </aside>
  );
}
