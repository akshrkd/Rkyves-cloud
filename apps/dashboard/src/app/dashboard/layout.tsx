"use client";

import { ReactNode } from "react";
import { BreadcrumbProvider } from "@/components/breadcrumb-provider";
import { OrgProvider } from "@/components/org-provider";
import { QueryProvider } from "@/components/query-provider";
import { SearchProvider } from "@/components/search-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <OrgProvider>
        <SearchProvider>
          <BreadcrumbProvider>{children}</BreadcrumbProvider>
        </SearchProvider>
      </OrgProvider>
    </QueryProvider>
  );
}
