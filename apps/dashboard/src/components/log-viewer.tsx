"use client";

import { useQuery } from "@tanstack/react-query";
import { CopyableCode } from "@/components/connection-info-panel";import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/loading-skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { api } from "@/lib/api";

export function LogViewer({ serviceId }: { serviceId: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["service-logs", serviceId],
    queryFn: () => api<{ logs: string; lineCount: number }>(`/services/${serviceId}/logs?tail=500`),
  });

  useSmartPolling(() => refetch(), 5000, true);

  if (isLoading) return <PageSkeleton />;
  if (error) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Failed to load logs"}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Runtime Logs</CardTitle>
        <CardDescription>
          Container output reported by the worker agent. {data?.lineCount ?? 0} lines buffered.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data?.logs ? (
          <CopyableCode code={data.logs} label="Logs" />
        ) : (
          <p className="text-sm text-muted-foreground">
            No logs yet. Logs appear when the agent reports container output for this service.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ServiceMetricsPanel({ serviceId }: { serviceId: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["service-metrics", serviceId],
    queryFn: () =>
      api<Array<{ cpuPercent: number | null; memoryMb: number | null; diskGb: number | null; recordedAt: string }>>(
        `/services/${serviceId}/metrics`
      ),
  });

  useSmartPolling(() => refetch(), 15000, true);

  if (isLoading) return null;
  if (error || !data?.length) return null;

  const latest = data[data.length - 1];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resource Usage</CardTitle>
        <CardDescription>Latest metrics reported by the worker agent</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <MetricStat label="CPU" value={latest.cpuPercent != null ? `${latest.cpuPercent.toFixed(1)}%` : "—"} />
        <MetricStat label="Memory" value={latest.memoryMb != null ? `${latest.memoryMb} MB` : "—"} />
        <MetricStat label="Disk" value={latest.diskGb != null ? `${latest.diskGb} GB` : "—"} />
      </CardContent>
    </Card>
  );
}

function MetricStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}