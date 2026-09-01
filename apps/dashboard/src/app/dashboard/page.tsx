"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SetBreadcrumbs } from "@/components/breadcrumb-provider";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { useOrg, useOrgEvents } from "@/components/org-switcher";
import { PageSkeleton } from "@/components/loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/error-state";
import { fetchOrgOverview } from "@/lib/dashboard-data";
import { formatRelativeTime } from "@/lib/format";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  FolderKanban,
  GitBranch,
  HardDrive,
  Rocket,
  Server,
} from "lucide-react";

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function DashboardHomePage() {
  const { selectedOrg, orgs, loading: orgLoading } = useOrg();
  const queryClient = useQueryClient();

  const onEvent = useCallback(
    (payload: Record<string, unknown>) => {
      const event = payload.event as string | undefined;
      const data = payload.data as Record<string, unknown> | undefined;
      if (selectedOrg) {
        queryClient.invalidateQueries({ queryKey: ["org-overview", selectedOrg] });
      }
      if (event === "deployment.updated" && data?.status === "failed") {
        toast.error(`Deployment failed${data.serviceName ? `: ${String(data.serviceName)}` : ""}`);
      }
      if (event === "worker.offline") {
        toast.warning("A worker appears offline");
      }
    },
    [selectedOrg, queryClient]
  );
  useOrgEvents(onEvent);

  const { data: overview, isLoading, error, refetch } = useQuery({
    queryKey: ["org-overview", selectedOrg],
    queryFn: () => fetchOrgOverview(selectedOrg),
    enabled: Boolean(selectedOrg),
  });

  const breadcrumbs = [{ label: "Home" }];

  if (orgLoading || (isLoading && !overview)) {
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
        <ErrorState message={error instanceof Error ? error.message : "Failed to load"} onRetry={() => refetch()} />
      </>
    );
  }

  if (!selectedOrg && orgs.length === 0) {
    return (
      <>
        <SetBreadcrumbs items={breadcrumbs} />
        <PageHeader title="Dashboard" description="No organizations found for your account." />
      </>
    );
  }

  return (
    <>
      <SetBreadcrumbs items={breadcrumbs} />
      <PageHeader
        title="Dashboard"
        description="Overview of your organization, services, and recent activity"
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/activity">Activity</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard/projects">
                View all projects
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />

      {overview && (
        <OnboardingChecklist
          orgId={selectedOrg}
          projectCount={overview.projects.length}
          workerCount={overview.workers.length}
          githubConnected={overview.githubConnected}
        />
      )}

      {overview && (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Projects" value={overview.projects.length} sub={`${overview.totalServices} total services`} icon={FolderKanban} />
            <StatCard label="Running" value={overview.runningServices} sub={overview.failedServices > 0 ? `${overview.failedServices} failed` : "All healthy"} icon={Activity} />
            <StatCard label="Workers" value={overview.onlineWorkers} sub={`${overview.workers.length} registered`} icon={HardDrive} />
            <StatCard label="GitHub" value={overview.githubConnected ? "Connected" : "Not connected"} sub={overview.githubConnected ? "Push-to-deploy ready" : "Connect in Integrations"} icon={GitBranch} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recent Deployments</CardTitle>
                  <CardDescription>Latest builds across web services</CardDescription>
                </div>
                <Rocket className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {overview.recentDeployments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No deployments yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {overview.recentDeployments.map((d) => (
                      <li key={d.id}>
                        <Link href={`/dashboard/services/${d.serviceId}`} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 transition-colors hover:border-primary/50">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{d.serviceName}</p>
                            <p className="truncate text-xs text-muted-foreground">{d.projectName} · {d.gitRef ?? "manual"}</p>
                          </div>
                          <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
                            <StatusBadge status={d.status} />
                            <span className="text-xs text-muted-foreground">{formatRelativeTime(d.startedAt)}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Workers</CardTitle>
                  <CardDescription>VM agents running your services</CardDescription>
                </div>
                <Server className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {overview.workers.length === 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">No workers registered yet.</p>
                    <Button asChild size="sm" variant="outline"><Link href="/dashboard/workers">Set up a worker</Link></Button>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {overview.workers.slice(0, 5).map((w) => (
                      <li key={w.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{w.workerId}</p>
                          <p className="text-xs text-muted-foreground">{w.hostname}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{w.serviceCount} svc</Badge>
                          <StatusBadge status={w.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
