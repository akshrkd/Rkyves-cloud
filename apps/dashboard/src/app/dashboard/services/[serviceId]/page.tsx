"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, HardDrive, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SetBreadcrumbs } from "@/components/breadcrumb-provider";
import { ConfirmButton } from "@/components/confirm-dialog";
import { ConnectionInfoPanel } from "@/components/connection-info-panel";
import { DeploymentLogsDialog } from "@/components/deployment-logs-dialog";
import { ErrorState } from "@/components/error-state";
import { LogViewer, ServiceMetricsPanel } from "@/components/log-viewer";
import { PageSkeleton } from "@/components/loading-skeleton";
import { ServiceIcon, StatusBadge } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useSmartPolling } from "@/hooks/use-smart-polling";
import { api, ApiError, CronJob, CronRun, Deployment, EnvVar, Service } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";

type ServiceDetail = Service & {
  project: { id: string; name: string; slug: string };
  envVars: Array<{ id: string; key: string; isSecret: boolean }>;
  deployments: Deployment[];
  cronJobs?: CronJob[];
};

export default function ServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [envSecret, setEnvSecret] = useState(true);
  const [bulkEnv, setBulkEnv] = useState("");
  const [domain, setDomain] = useState("");
  const [deployGitRef, setDeployGitRef] = useState("");
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [logsDeployment, setLogsDeployment] = useState<Deployment | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<EnvVar | null>(null);
  const [editEnvValue, setEditEnvValue] = useState("");
  const [selectedCronJob, setSelectedCronJob] = useState<string | null>(null);

  const {
    data: service,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["service", serviceId],
    queryFn: () => api<ServiceDetail>(`/services/${serviceId}`),
  });

  const { data: envVars = [], refetch: refetchEnv } = useQuery({
    queryKey: ["service-env", serviceId],
    queryFn: () => api<EnvVar[]>(`/services/${serviceId}/env`),
    enabled: Boolean(service),
  });

  const { data: cronRuns = [] } = useQuery({
    queryKey: ["cron-runs", selectedCronJob],
    queryFn: () => api<CronRun[]>(`/cron/${selectedCronJob}/runs`),
    enabled: Boolean(selectedCronJob),
  });

  const shouldPoll = useMemo(() => {
    if (!service) return false;
    if (service.status === "pending" || service.status === "building" || service.status === "deploying") {
      return true;
    }
    return service.deployments?.some(
      (d) => d.status === "building" || d.status === "deploying" || d.status === "pending"
    );
  }, [service]);

  useSmartPolling(() => {
    refetch();
    refetchEnv();
  }, 5000, shouldPoll);

  const config = (service?.config ?? {}) as Record<string, string>;
  const [settingsName, setSettingsName] = useState("");
  const [settingsBranch, setSettingsBranch] = useState("");
  const [settingsPort, setSettingsPort] = useState("");
  const [settingsDockerfile, setSettingsDockerfile] = useState("");
  const [settingsBuildCmd, setSettingsBuildCmd] = useState("");
  const [settingsStartCmd, setSettingsStartCmd] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!service) return;
    setSettingsName(service.name);
    const cfg = (service.config ?? {}) as Record<string, string>;
    setSettingsBranch(cfg.branch ?? cfg.gitBranch ?? "");
    setSettingsPort(cfg.port ?? "");
    setSettingsDockerfile(cfg.dockerfilePath ?? cfg.dockerfile ?? "");
    setSettingsBuildCmd(cfg.buildCommand ?? "");
    setSettingsStartCmd(cfg.startCommand ?? "");
  }, [service]);

  const breadcrumbs = useMemo(
    () =>
      service
        ? [
            { label: "Home", href: "/dashboard" },
            { label: "Projects", href: "/dashboard/projects" },
            { label: service.project.name, href: `/dashboard/projects/${service.project.id}` },
            { label: service.name },
          ]
        : [
            { label: "Home", href: "/dashboard" },
            { label: "Projects", href: "/dashboard/projects" },
            { label: "Service" },
          ],
    [service]
  );

  const tabs = useMemo(() => {
    if (!service) return ["overview"];
    const list = ["overview", "env", "logs", "settings"];
    if (service.type === "web") list.splice(2, 0, "deploy");
    if (service.type === "cron") list.splice(2, 0, "cron");
    return list;
  }, [service]);

  async function invalidateService() {
    await queryClient.invalidateQueries({ queryKey: ["service", serviceId] });
    await refetchEnv();
  }

  async function addEnv(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/services/${serviceId}/env`, {
        method: "POST",
        body: JSON.stringify({ key: envKey, value: envValue, isSecret: envSecret }),
      });
      setEnvKey("");
      setEnvValue("");
      toast.success("Environment variable saved");
      if (service?.type === "web") {
        toast.info("Redeploy may be required for changes to take effect");
      }
      invalidateService();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save variable");
    }
  }

  async function importBulkEnv(e: FormEvent) {
    e.preventDefault();
    const lines = bulkEnv.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
    try {
      for (const line of lines) {
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        await api(`/services/${serviceId}/env`, {
          method: "POST",
          body: JSON.stringify({ key, value, isSecret: true }),
        });
      }
      setBulkEnv("");
      toast.success(`Imported ${lines.length} variable(s)`);
      invalidateService();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function deleteEnv(key: string) {
    try {
      await api(`/services/${serviceId}/env/${encodeURIComponent(key)}`, { method: "DELETE" });
      toast.success("Variable deleted");
      invalidateService();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function saveEditedEnv(e: FormEvent) {
    e.preventDefault();
    if (!editingEnv) return;
    try {
      await api(`/services/${serviceId}/env`, {
        method: "POST",
        body: JSON.stringify({ key: editingEnv.key, value: editEnvValue, isSecret: editingEnv.isSecret }),
      });
      setEditingEnv(null);
      toast.success("Variable updated");
      invalidateService();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function addDomain(e: FormEvent) {
    e.preventDefault();
    try {
      await api(`/services/${serviceId}/domains`, {
        method: "POST",
        body: JSON.stringify({ hostname: domain, isPrimary: true }),
      });
      setDomain("");
      toast.success("Domain added");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add domain");
    }
  }

  async function removeDomain(domainId: string) {
    try {
      await api(`/services/${serviceId}/domains/${domainId}`, { method: "DELETE" });
      toast.success("Domain removed");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove domain");
    }
  }

  async function triggerDeploy() {
    setDeploying(true);
    try {
      const body = deployGitRef.trim() ? { gitRef: deployGitRef.trim() } : {};
      await api(`/services/${serviceId}/deploy`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setDeployDialogOpen(false);
      setDeployGitRef("");
      toast.success("Deployment started");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setDeploying(false);
    }
  }

  async function restartService() {
    setRestarting(true);
    try {
      await api(`/services/${serviceId}/restart`, { method: "POST" });
      toast.success("Restart requested");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restart failed");
    } finally {
      setRestarting(false);
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api(`/services/${serviceId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: settingsName,
          config: {
            branch: settingsBranch || undefined,
            port: settingsPort || undefined,
            dockerfilePath: settingsDockerfile || undefined,
            buildCommand: settingsBuildCmd || undefined,
            startCommand: settingsStartCmd || undefined,
          },
        }),
      });
      toast.success("Settings saved");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  async function deleteService() {
    setDeleting(true);
    try {
      await api(`/services/${serviceId}`, { method: "DELETE" });
      toast.success("Service deleted");
      router.push(`/dashboard/projects/${service!.project.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  async function toggleCronJob(jobId: string, enabled: boolean) {
    try {
      await api(`/cron/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      toast.success(enabled ? "Cron job enabled" : "Cron job disabled");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update cron job");
    }
  }

  if (isLoading) {
    return (
      <>
        <SetBreadcrumbs items={breadcrumbs} />
        <PageSkeleton />
      </>
    );
  }

  if (error || !service) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <>
        <SetBreadcrumbs items={breadcrumbs} />
        <ErrorState
          title={is404 ? "Service not found" : "Failed to load service"}
          message={error instanceof Error ? error.message : "Service could not be loaded"}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  const isProvisioning = service.status === "pending";
  const cronJobs = service.cronJobs ?? [];

  return (
    <>
      <SetBreadcrumbs items={breadcrumbs} />
      <DeploymentLogsDialog deployment={logsDeployment} open={logsOpen} onOpenChange={setLogsOpen} />

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-muted p-4">
            <ServiceIcon type={service.type} className="h-8 w-8" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold">{service.name}</h1>
              <StatusBadge status={service.status} />
              <Badge variant="outline" className="uppercase">
                {service.type}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {service.slug} · in {service.project.name}
            </p>
          </div>
        </div>
        {service.type === "web" && service.status === "running" && (
          <Button variant="outline" onClick={restartService} disabled={restarting}>
            <RotateCw className={`h-4 w-4 ${restarting ? "animate-spin" : ""}`} />
            Restart
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t} value={t} className="capitalize">
              {t === "env" ? "Env Vars" : t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <ConnectionInfoPanel connectionInfo={service.connectionInfo} isProvisioning={isProvisioning} />
          <ServiceMetricsPanel serviceId={serviceId} />

          {service.domains && service.domains.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Domains</CardTitle>
                <CardDescription>
                  Point a CNAME record to your worker hostname or use the provided subdomain.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {service.domains.map((d) => (
                  <div
                    key={d.id ?? d.hostname}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://${d.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm hover:text-primary"
                      >
                        {d.hostname}
                      </a>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      {d.isPrimary && <Badge variant="secondary">Primary</Badge>}
                      {d.sslEnabled === false && <Badge variant="warning">SSL pending</Badge>}
                    </div>
                    {d.id && (
                      <ConfirmButton
                        label="Remove"
                        title="Remove domain?"
                        description={`${d.hostname} will no longer route to this service.`}
                        confirmLabel="Remove"
                        onConfirm={() => removeDomain(d.id!)}
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {service.type === "web" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add Domain</CardTitle>
                <CardDescription>
                  Create a CNAME pointing to your worker or use a subdomain under your platform domain.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={addDomain} className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="api.myapp.rkyves.com"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  />
                  <Button type="submit" variant="secondary">
                    Add Domain
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {service.worker && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Worker</CardTitle>
                <CardDescription>The VM agent running this service.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{service.worker.workerId}</p>
                    <p className="text-sm text-muted-foreground">{service.worker.hostname}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={service.worker.status} />
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/dashboard/workers">View Workers</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="env">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Environment Variables</CardTitle>
              <CardDescription>
                Inject configuration at runtime. Secret values are encrypted; non-secret values are shown below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {envVars.length === 0 ? (
                <p className="text-sm text-muted-foreground">No environment variables configured.</p>
              ) : (
                <ul className="space-y-2">
                  {envVars.map((v) => (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-primary">{v.key}</span>
                        {!v.isSecret && v.value && (
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{v.value}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{v.isSecret ? "Secret" : "Visible"}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingEnv(v);
                            setEditEnvValue(v.isSecret ? "" : v.value);
                          }}
                        >
                          Edit
                        </Button>
                        <ConfirmButton
                          label="Delete"
                          title="Delete variable?"
                          description={`Remove ${v.key} from this service.`}
                          onConfirm={() => deleteEnv(v.key)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={addEnv} className="space-y-3 border-t border-border pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="env-key">Key</Label>
                    <Input
                      id="env-key"
                      placeholder="DATABASE_URL"
                      value={envKey}
                      onChange={(e) => setEnvKey(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="env-value">Value</Label>
                    <Input
                      id="env-value"
                      placeholder="value"
                      value={envValue}
                      onChange={(e) => setEnvValue(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch id="env-secret" checked={envSecret} onCheckedChange={setEnvSecret} />
                  <Label htmlFor="env-secret">Mark as secret</Label>
                </div>
                <Button type="submit">Add Variable</Button>
              </form>

              <form onSubmit={importBulkEnv} className="space-y-3 border-t border-border pt-4">
                <Label htmlFor="bulk-env">Bulk import (KEY=value per line)</Label>
                <Textarea
                  id="bulk-env"
                  placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=secret"}
                  value={bulkEnv}
                  onChange={(e) => setBulkEnv(e.target.value)}
                  rows={4}
                />
                <Button type="submit" variant="secondary">
                  Import
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {service.type === "web" && (
          <TabsContent value="deploy">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">Deployments</CardTitle>
                  <CardDescription>Build and deploy history for this web service.</CardDescription>
                </div>
                <Button onClick={() => setDeployDialogOpen(true)}>Deploy Now</Button>
              </CardHeader>
              <CardContent>
                {service.deployments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No deployments yet. Push to your repo or click Deploy Now.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="pb-2 font-medium">Ref</th>
                          <th className="pb-2 font-medium">Status</th>
                          <th className="pb-2 font-medium">Started</th>
                          <th className="pb-2 font-medium">Logs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {service.deployments.map((d) => (
                          <tr key={d.id} className="border-b border-border/50">
                            <td className="py-3 font-mono">{d.gitRef ?? "manual"}</td>
                            <td className="py-3">
                              <StatusBadge status={d.status} />
                            </td>
                            <td className="py-3 text-muted-foreground">{formatRelativeTime(d.startedAt)}</td>
                            <td className="py-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setLogsDeployment(d);
                                  setLogsOpen(true);
                                }}
                              >
                                View logs
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {service.type === "cron" && (
          <TabsContent value="cron" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cron Jobs</CardTitle>
                <CardDescription>Scheduled tasks for this service.</CardDescription>
              </CardHeader>
              <CardContent>
                {cronJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No cron jobs configured.</p>
                ) : (
                  <ul className="space-y-3">
                    {cronJobs.map((j) => (
                      <li
                        key={j.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm"
                      >
                        <div>
                          <span className="font-mono text-primary">{j.schedule}</span>
                          <span className="mx-2 text-muted-foreground">—</span>
                          <span>{j.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={j.enabled}
                            onCheckedChange={(checked) => toggleCronJob(j.id, checked)}
                          />
                          <Button variant="ghost" size="sm" onClick={() => setSelectedCronJob(j.id)}>
                            Run history
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {selectedCronJob && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Run History</CardTitle>
                  <CardDescription>Recent executions for selected job</CardDescription>
                </CardHeader>
                <CardContent>
                  {cronRuns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="pb-2 font-medium">Status</th>
                            <th className="pb-2 font-medium">Started</th>
                            <th className="pb-2 font-medium">Error</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cronRuns.map((r) => (
                            <tr key={r.id} className="border-b border-border/50">
                              <td className="py-2">
                                <StatusBadge status={r.status} />
                              </td>
                              <td className="py-2 text-muted-foreground">{formatRelativeTime(r.startedAt)}</td>
                              <td className="py-2 text-muted-foreground">{r.error ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="logs">
          <LogViewer serviceId={serviceId} />
        </TabsContent>

        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Service Settings</CardTitle>
              <CardDescription>Update name and build configuration.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveSettings} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="svc-name">Name</Label>
                  <Input id="svc-name" value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
                </div>
                {service.type === "web" && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="svc-branch">Git branch</Label>
                        <Input
                          id="svc-branch"
                          value={settingsBranch}
                          onChange={(e) => setSettingsBranch(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="svc-port">Port</Label>
                        <Input id="svc-port" value={settingsPort} onChange={(e) => setSettingsPort(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="svc-dockerfile">Dockerfile path</Label>
                      <Input
                        id="svc-dockerfile"
                        value={settingsDockerfile}
                        onChange={(e) => setSettingsDockerfile(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="svc-build">Build command</Label>
                        <Input
                          id="svc-build"
                          value={settingsBuildCmd}
                          onChange={(e) => setSettingsBuildCmd(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="svc-start">Start command</Label>
                        <Input
                          id="svc-start"
                          value={settingsStartCmd}
                          onChange={(e) => setSettingsStartCmd(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
                <Button type="submit" disabled={savingSettings}>
                  {savingSettings ? "Saving..." : "Save Settings"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
              <CardDescription>Permanently delete this service and all associated data.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Delete service
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deploy service</DialogTitle>
            <DialogDescription>
              Deploy the latest commit or specify a git ref (branch, tag, or commit).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="git-ref">Git ref (optional)</Label>
            <Input
              id="git-ref"
              placeholder="main"
              value={deployGitRef}
              onChange={(e) => setDeployGitRef(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={triggerDeploy} disabled={deploying}>
              {deploying ? "Deploying..." : "Deploy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete service?</DialogTitle>
            <DialogDescription>
              Type <strong>{service.name}</strong> to confirm. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={service.name}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== service.name || deleting}
              onClick={deleteService}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingEnv)} onOpenChange={(o) => !o && setEditingEnv(null)}>
        <DialogContent>
          <form onSubmit={saveEditedEnv}>
            <DialogHeader>
              <DialogTitle>Edit {editingEnv?.key}</DialogTitle>
              <DialogDescription>
                {editingEnv?.isSecret
                  ? "Enter a new value. Leave blank to keep the existing secret."
                  : "Update the variable value."}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                value={editEnvValue}
                onChange={(e) => setEditEnvValue(e.target.value)}
                placeholder={editingEnv?.isSecret ? "New secret value" : "Value"}
                required={!editingEnv?.isSecret}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingEnv(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
