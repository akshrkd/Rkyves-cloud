"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CopyableCode } from "@/components/connection-info-panel";
import { StatusBadge } from "@/components/shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { api, Deployment } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

export function DeploymentLogsDialog({
  deployment,
  open,
  onOpenChange,
}: {
  deployment: Deployment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [live, setLive] = useState<Deployment | null>(deployment);

  useEffect(() => {
    setLive(deployment);
  }, [deployment]);

  const isActive =
    live?.status === "building" || live?.status === "deploying" || live?.status === "pending";

  const { data, refetch } = useQuery({
    queryKey: ["deployment", live?.id],
    queryFn: () => api<Deployment>(`/deployments/${live!.id}`),
    enabled: Boolean(open && live?.id),
  });

  useEffect(() => {
    if (data) setLive(data);
  }, [data]);

  useSmartPolling(() => refetch(), 3000, Boolean(open && isActive));

  if (!live) return null;

  const logs = live.buildLogs?.trim();
  const hasLogs = Boolean(logs);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Deployment {live.gitRef ?? "manual"}
            <StatusBadge status={live.status} />
          </DialogTitle>
          <DialogDescription>
            Started {formatRelativeTime(live.startedAt)}
            {live.completedAt && ` · Completed ${formatRelativeTime(live.completedAt)}`}
            {isActive && " · Live updating…"}
          </DialogDescription>
        </DialogHeader>

        {live.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-red-300">
            {live.error}
          </div>
        )}

        {hasLogs ? (
          <CopyableCode code={logs!} label="Build logs" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {isActive
              ? "Build in progress — logs will appear when the agent reports them."
              : "No build logs recorded for this deployment."}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
