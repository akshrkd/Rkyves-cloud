"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Search, Server } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/components/search-provider";
import { useOrg } from "@/components/org-provider";
import { api } from "@/lib/api";
import { fetchSearchIndex } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type IndexItem = {
  type: "project" | "service";
  id: string;
  name: string;
  subtitle: string;
  href: string;
};

export function GlobalSearch() {
  const { open, setOpen } = useSearch();
  const { selectedOrg } = useOrg();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState<IndexItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    if (!open || !selectedOrg) {
      setQuery("");
      setSelected(0);
      return;
    }

    async function load() {
      setLoading(true);
      try {
        const items = await fetchSearchIndex(selectedOrg, query);
        setIndex(items.map((item) => ({ ...item, href: item.href ?? "#" })));
      } finally {
        setLoading(false);
      }
    }
    const timer = setTimeout(load, query ? 200 : 0);
    return () => clearTimeout(timer);
  }, [open, selectedOrg, query]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index.slice(0, 12);
    return index
      .filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.subtitle.toLowerCase().includes(q)
      )
      .slice(0, 12);
  }, [index, query]);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === "Enter" && results[selected]) {
      e.preventDefault();
      navigate(results[selected].href);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">Search projects and services</DialogDescription>
          <div className="relative">
            <Search className="absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="global-search-input"
              placeholder="Search projects and services..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              onKeyDown={onKeyDown}
              className="border-0 pl-7 shadow-none focus-visible:ring-0"
              autoFocus
            />
          </div>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto p-2">
          {loading ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading...</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {query ? "No results found" : "No projects or services yet"}
            </p>
          ) : (
            <ul>
              {results.map((item, i) => {
                const Icon = item.type === "project" ? FolderKanban : Server;
                return (
                  <li key={`${item.type}-${item.id}`}>
                    <button
                      type="button"
                      onClick={() => navigate(item.href)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                        i === selected ? "bg-accent" : "hover:bg-accent/50"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                      </div>
                      <span className="ml-auto shrink-0 text-xs capitalize text-muted-foreground">
                        {item.type}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <kbd className="rounded border border-border px-1">↑↓</kbd> navigate ·{" "}
          <kbd className="rounded border border-border px-1">↵</kbd> open ·{" "}
          <kbd className="rounded border border-border px-1">esc</kbd> close
        </div>
      </DialogContent>
    </Dialog>
  );
}
