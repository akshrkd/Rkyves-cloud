"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="p-8">
      <ErrorState
        title="Dashboard error"
        message={error.message || "Failed to load this page."}
        onRetry={reset}
      />
      <Button variant="link" className="mt-4" asChild>
        <a href="/dashboard">Go to home</a>
      </Button>
    </div>
  );
}
