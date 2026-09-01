"use client";

import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-skeleton";
import NewServicePage from "./new-service-content";

export default function NewServicePageWrapper() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewServicePage />
    </Suspense>
  );
}
