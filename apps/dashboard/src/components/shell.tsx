"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearToken } from "@/lib/api";

export function Shell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const router = useRouter();

  function logout() {
    clearToken();
    router.push("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/50">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-lg font-bold text-white">
              Rkyves Cloud
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/dashboard" className="text-slate-400 hover:text-white">
                Projects
              </Link>
              <Link href="/dashboard/workers" className="text-slate-400 hover:text-white">
                Workers
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            {title && <span className="text-sm text-slate-400">{title}</span>}
            <button onClick={logout} className="btn-secondary text-xs">
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "running"
      ? "badge-running"
      : status === "failed"
        ? "badge-failed"
        : "badge-pending";
  return <span className={cls}>{status}</span>;
}

export function ServiceIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    web: "🌐",
    postgres: "🐘",
    redis: "⚡",
    storage: "📦",
    cron: "⏰",
  };
  return <span className="text-2xl">{icons[type] ?? "📌"}</span>;
}
