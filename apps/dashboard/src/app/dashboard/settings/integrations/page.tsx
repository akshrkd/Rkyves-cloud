"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { GitBranch, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { SetBreadcrumbs } from "@/components/breadcrumb-provider";
import { useOrg } from "@/components/org-provider";
import { ConfirmButton } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/page-header";
import { PageSkeleton } from "@/components/loading-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

type GitHubStatus = {
  configured: boolean;
  connected: boolean;
  accountLogin: string | null;
  accountType: string | null;
};

const CAPABILITIES = [
  "List repositories from your GitHub account",
  "Auto-detect Dockerfile, port, and build settings",
  "Enable push-to-deploy on web services",
];

function IntegrationsContent() {
  const searchParams = useSearchParams();
  const { selectedOrg, setSelectedOrg, orgs } = useOrg();
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const breadcrumbs = useMemo(
    () => [
      { label: "Home", href: "/dashboard" },
      { label: "Settings", href: "/dashboard/settings" },
      { label: "Integrations" },
    ],
    []
  );

  useEffect(() => {
    const orgFromQuery = searchParams.get("organizationId");
    if (orgFromQuery && orgs.some((o) => o.id === orgFromQuery)) {
      setSelectedOrg(orgFromQuery);
    }
  }, [searchParams, orgs, setSelectedOrg]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) toast.success("GitHub connected successfully");
    if (error) toast.error(`GitHub connection failed: ${error}`);
  }, [searchParams]);

  useEffect(() => {
    if (!selectedOrg) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<GitHubStatus>(`/integrations/github/status?organizationId=${selectedOrg}`)
      .then(setStatus)
      .finally(() => setLoading(false));
  }, [selectedOrg]);

  async function connectGitHub() {
    setActionLoading(true);
    try {
      const { url } = await api<{ url: string }>(
        `/integrations/github/install-url?organizationId=${selectedOrg}`
      );
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start GitHub connection");
      setActionLoading(false);
    }
  }

  async function disconnectGitHub() {
    setActionLoading(true);
    try {
      await api(`/integrations/github?organizationId=${selectedOrg}`, { method: "DELETE" });
      setStatus({ configured: true, connected: false, accountLogin: null, accountType: null });
      toast.success("GitHub disconnected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      <SetBreadcrumbs items={breadcrumbs} />
      <PageHeader
        title="Integrations"
        description="Connect external services to enhance your deployment workflow"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-muted p-3">
              <GitBranch className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">GitHub</CardTitle>
                {loading ? (
                  <Badge variant="secondary">Loading...</Badge>
                ) : !status?.configured ? (
                  <Badge variant="warning">Not configured</Badge>
                ) : status.connected ? (
                  <Badge variant="success">Connected</Badge>
                ) : (
                  <Badge variant="secondary">Not connected</Badge>
                )}
              </div>
              <CardDescription className="mt-1">
                Install the Rkyves GitHub App to list repos, auto-detect settings, and enable push-to-deploy.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {CAPABILITIES.map((cap) => (
              <li key={cap} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                {cap}
              </li>
            ))}
          </ul>

          {loading ? (
            <p className="text-sm text-muted-foreground">Checking connection status...</p>
          ) : !status?.configured ? (
            <Alert variant="warning">
              <AlertTitle>Server not configured</AlertTitle>
              <AlertDescription>
                GitHub App is not configured on this server. Set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY in the API environment.
              </AlertDescription>
            </Alert>
          ) : status.connected ? (
            <div className="space-y-3">
              <p className="text-sm">
                Connected as <strong>{status.accountLogin}</strong> ({status.accountType})
              </p>
              <ConfirmButton
                label="Disconnect GitHub"
                title="Disconnect GitHub?"
                description="Webhooks on linked services will be removed. You will need to reconnect to deploy from GitHub again."
                confirmLabel="Disconnect"
                onConfirm={disconnectGitHub}
                loading={actionLoading}
              />
            </div>
          ) : (
            <Button onClick={connectGitHub} disabled={actionLoading || !selectedOrg}>
              {actionLoading ? "Redirecting..." : "Connect GitHub"}
            </Button>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <IntegrationsContent />
    </Suspense>
  );
}
