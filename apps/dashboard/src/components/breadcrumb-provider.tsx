"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { DashboardShell } from "@/components/shell";
import type { BreadcrumbItem } from "@/components/breadcrumbs";

type BreadcrumbContextValue = {
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  setBreadcrumbs: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [breadcrumbs, setBreadcrumbsState] = useState<BreadcrumbItem[]>([]);
  const setBreadcrumbs = useCallback((items: BreadcrumbItem[]) => {
    setBreadcrumbsState(items);
  }, []);

  return (
    <BreadcrumbContext.Provider value={{ setBreadcrumbs }}>
      <DashboardShell breadcrumbs={breadcrumbs}>{children}</DashboardShell>
    </BreadcrumbContext.Provider>
  );
}

export function SetBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const { setBreadcrumbs } = useContext(BreadcrumbContext);
  const serialized = JSON.stringify(items);

  useEffect(() => {
    setBreadcrumbs(JSON.parse(serialized) as BreadcrumbItem[]);
    return () => setBreadcrumbs([]);
  }, [serialized, setBreadcrumbs]);

  return null;
}
