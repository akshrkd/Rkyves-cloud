"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { HardDrive, Server } from "lucide-react";
import { SetBreadcrumbs } from "@/components/breadcrumb-provider";
import { CopyableCode } from "@/components/connection-info-panel";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/loading-skeleton";
import { StatusBadge } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { api, MetricSnapshot, Worker } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function ResourceBar({ label, value, max, unit }: { label: string; value: number; max: number; unit: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span>
          {value} {unit}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function isStale(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return true;
  return Date.now() - new Date(lastSeenAt).getTime() > 60_000;
}

function WorkerMetrics({ workerId }: { workerId: string }) {
  const { data } = useQuery({
    queryKey: ["worker-metrics", workerId],
    queryFn: () => api<MetricSnapshot[]>(`/workers/${workerId}/metrics`),
  });

  if (!data?.length) return null;
  const latest = data[data.length - 1];
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <ResourceBar label="CPU" value={latest.cpuPercent ?? 0} max={100} unit="%" />
      <ResourceBar
        label="Memory"
        value={latest.memoryMb != null ? Math.round(latest.memoryMb / 1024) : 0}
        max={64}
        unit="GB"
      />
      <ResourceBar label="Disk" value={latest.diskGb ?? 0} max={500} unit="GB" />
    </div>
  );
}

export default function WorkersPage() {
  const breadcrumbs = useMemo(
    () => [{ label: "Home", href: "/dashboard" }, { label: "Workers" }],
    []
  );

  const { data: workers = [], isLoading, error, refetch } = useQuery({
    queryKey: ["workers"],
    queryFn: () => api<Worker[]>("/workers"),
  });

  useSmartPolling(() => refetch(), 10000, true);

  const setupSnippet = `# On a new VM, run agent with unique worker ID:
WORKER_ID=worker-2 \\
AGENT_API_URL=${API_URL} \\
AGENT_TOKEN=your-token \\
docker compose up agent -d`;

  if (isLoading) {
    return (
      <>
        <SetBreadcrumbs items={breadcrumbs} />
        <PageSkeleton />
      </>
    );
  }

  if (error) {
    return (
      <>
        <SetBreadcrumbs items={breadcrumbs} />
        <ErrorState message={error instanceof Error ? error.message : "Failed to load workers"} onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <>
      <SetBreadcrumbs items={breadcrumbs} />
      <PageHeader
        title="Workers"
        description="VM agents that provision and run your services. Each worker is a machine running the Rkyves agent."
      />

      {workers.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No workers registered"
          description="Workers are VM agents that run your services. Deploy the agent container on a VM to get started."
        />
      ) : (
        <div className="grid gap-4">
          {workers.map((w) => (
            <Card key={w.id}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-muted p-2">
                    <HardDrive className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{w.workerId}</CardTitle>
                    <CardDescription>{w.hostname}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isStale(w.lastSeenAt) && w.status !== "offline" && (
                    <Badge variant="warning">Stale</Badge>
                  )}
                  <StatusBadge status={w.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <ResourceBar label="CPU" value={w.cpuCores} max={16} unit="cores" />
                  <ResourceBar label="Memory" value={Math.round(w.memoryMb / 1024)} max={64} unit="GB" />
                  <ResourceBar label="Disk" value={w.diskGb} max={500} unit="GB" />
                </div>
                <WorkerMetrics workerId={w.id} />
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>{w.serviceCount} services running</span>
                  {w.lastSeenAt && <span>Last seen {formatRelativeTime(w.lastSeenAt)}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">Add a Worker VM</CardTitle>
          <CardDescription>
            Deploy the agent on a new VM with a unique WORKER_ID. The agent registers itself and begins accepting service assignments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyableCode code={setupSnippet} label="Setup command" />
        </CardContent>
      </Card>
    </>
  );
}
