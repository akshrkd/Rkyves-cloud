"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard } from "lucide-react";
import { useSearch } from "@/components/search-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS = [
  { keys: ["/"], description: "Open search" },
  { keys: ["g", "h"], description: "Go to Home" },
  { keys: ["g", "p"], description: "Go to Projects" },
  { keys: ["g", "w"], description: "Go to Workers" },
  { keys: ["g", "s"], description: "Go to Settings" },
  { keys: ["?"], description: "Show keyboard shortcuts" },
];

export function KeyboardShortcuts() {
  const router = useRouter();
  const { setOpen: setSearchOpen } = useSearch();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.key === "?" && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (e.key === "/" && !isInput && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (isInput) return;

      if (pendingRef.current) {
        e.preventDefault();
        pendingRef.current = false;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (e.key === "h") router.push("/dashboard");
        else if (e.key === "p") router.push("/dashboard/projects");
        else if (e.key === "w") router.push("/dashboard/workers");
        else if (e.key === "s") router.push("/dashboard/settings");
        return;
      }

      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        pendingRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          pendingRef.current = false;
        }, 1000);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [router, setSearchOpen]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="hidden sm:inline-flex"
        onClick={() => setHelpOpen(true)}
        aria-label="Keyboard shortcuts"
      >
        <Keyboard className="h-4 w-4" />
      </Button>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Navigate faster across the dashboard</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {SHORTCUTS.map((s) => (
              <li key={s.description} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{s.description}</span>
                <span className="flex gap-1">
                  {s.keys.map((k) => (
                    <kbd key={k} className="rounded border border-border px-2 py-0.5 font-mono text-xs">
                      {k}
                    </kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
