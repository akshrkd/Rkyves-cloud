"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { SetBreadcrumbs } from "@/components/breadcrumb-provider";
import { useOrg } from "@/components/org-provider";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/loading-skeleton";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, AuditLog } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

const ACTION_LABELS: Record<string, string> = {
  "service.created": "Service created",
  "service.deleted": "Service deleted",
  "service.updated": "Service updated",
  "service.restarted": "Service restarted",
  "deployment.triggered": "Deployment triggered",
  "env.deleted": "Env var deleted",
  "domain.deleted": "Domain removed",
  "member.invited": "Member invited",
  "member.removed": "Member removed",
  "member.role_updated": "Member role updated",
};

export default function ActivityPage() {
  const { selectedOrg } = useOrg();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["activity", selectedOrg],
    queryFn: () => api<AuditLog[]>(`/orgs/${selectedOrg}/activity`),
    enabled: Boolean(selectedOrg),
  });

  const breadcrumbs = [
    { label: "Home", href: "/dashboard" },
    { label: "Activity" },
  ];

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
        <ErrorState message={error instanceof Error ? error.message : "Failed to load"} onRetry={() => refetch()} />
      </>
    );
  }

  return (
    <>
      <SetBreadcrumbs items={breadcrumbs} />
      <PageHeader title="Activity" description="Recent actions across your organization" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log</CardTitle>
          <CardDescription>Who did what and when</CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.length ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.map((log) => (
                <li key={log.id} className="flex items-start justify-between rounded-lg border border-border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{ACTION_LABELS[log.action] ?? log.action}</p>
                    <p className="text-muted-foreground">
                      {log.resourceName && `${log.resourceName} · `}
                      {log.resourceType}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
