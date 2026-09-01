"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SetBreadcrumbs } from "@/components/breadcrumb-provider";
import { ListSkeleton } from "@/components/loading-skeleton";
import { PageHeader } from "@/components/page-header";
import { SERVICE_TYPES, ServiceTypeCard } from "@/components/service-type-card";
import { WizardStepper } from "@/components/wizard-stepper";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";

const WIZARD_STEPS = [
  { id: "type", label: "Choose Type" },
  { id: "configure", label: "Configure" },
  { id: "review", label: "Review" },
];

type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  description: string | null;
};

type RepoAnalysis = {
  gitBranch: string;
  dockerfilePath: string;
  port: number;
  buildCommand?: string;
  startCommand?: string;
  healthCheckPath: string;
  nameSuggestion: string;
  needsDockerfile: boolean;
  sources: Record<string, string>;
};

export default function NewServiceContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedType = searchParams.get("type");

  const [step, setStep] = useState(preselectedType ? 2 : 1);
  const [selectedType, setSelectedType] = useState(preselectedType ?? "");
  const [organizationId, setOrganizationId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [githubConnected, setGithubConnected] = useState(false);
  const [githubConfigured, setGithubConfigured] = useState(true);

  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 0 * * *");
  const [targetUrl, setTargetUrl] = useState("");

  const [repoSearch, setRepoSearch] = useState("");
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [gitBranch, setGitBranch] = useState("main");
  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null);

  const [dockerfilePath, setDockerfilePath] = useState("Dockerfile");
  const [port, setPort] = useState(3000);
  const [buildCommand, setBuildCommand] = useState("");
  const [startCommand, setStartCommand] = useState("");
  const [healthCheckPath, setHealthCheckPath] = useState("/health");

  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [error, setError] = useState("");

  const breadcrumbs = useMemo(
    () => [
      { label: "Home", href: "/dashboard" },
      { label: "Projects", href: "/dashboard/projects" },
      { label: projectName || "Project", href: `/dashboard/projects/${projectId}` },
      { label: "New Service" },
    ],
    [projectId, projectName]
  );

  useEffect(() => {
    api<{ organizationId: string; name: string }>(`/projects/${projectId}`).then((project) => {
      setOrganizationId(project.organizationId);
      setProjectName(project.name);
    });
  }, [projectId]);

  useEffect(() => {
    if (!organizationId || selectedType !== "web") return;
    api<{ configured: boolean; connected: boolean }>(
      `/integrations/github/status?organizationId=${organizationId}`
    ).then((status) => {
      setGithubConfigured(status.configured);
      setGithubConnected(status.connected);
    });
  }, [organizationId, selectedType]);

  useEffect(() => {
    if (!organizationId || !githubConnected || step !== 2) return;
    setLoadingRepos(true);
    const timer = setTimeout(() => {
      api<{ repos: GitHubRepo[] }>(
        `/integrations/github/repos?organizationId=${organizationId}&search=${encodeURIComponent(repoSearch)}`
      )
        .then((data) => setRepos(data.repos))
        .finally(() => setLoadingRepos(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [organizationId, githubConnected, repoSearch, step]);

  async function selectRepo(repo: GitHubRepo) {
    setSelectedRepo(repo);
    setAnalyzing(true);
    setError("");
    try {
      const branchList = await api<{ branches: string[] }>(
        `/integrations/github/repos/${repo.owner}/${repo.name}/branches?organizationId=${organizationId}`
      );
      setBranches(branchList.branches);
      const branch = branchList.branches.includes(repo.defaultBranch)
        ? repo.defaultBranch
        : branchList.branches[0] ?? "main";
      setGitBranch(branch);
      await runAnalysis(repo.owner, repo.name, branch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repository");
    } finally {
      setAnalyzing(false);
    }
  }

  async function runAnalysis(owner: string, repo: string, branch: string) {
    setAnalyzing(true);
    try {
      const result = await api<RepoAnalysis>(
        `/integrations/github/repos/${owner}/${repo}/analyze?organizationId=${organizationId}&branch=${encodeURIComponent(branch)}`
      );
      setAnalysis(result);
      setName(result.nameSuggestion);
      setDockerfilePath(result.dockerfilePath);
      setPort(result.port);
      setBuildCommand(result.buildCommand ?? "");
      setStartCommand(result.startCommand ?? "");
      setHealthCheckPath(result.healthCheckPath);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze repository");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleBranchChange(branch: string) {
    setGitBranch(branch);
    if (selectedRepo) {
      await runAnalysis(selectedRepo.owner, selectedRepo.name, branch);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const config: Record<string, unknown> = {};

    if (selectedType === "web") {
      config.gitBranch = gitBranch;
      config.dockerfilePath = dockerfilePath;
      config.port = port;
      config.healthCheckPath = healthCheckPath;
      if (buildCommand) config.buildCommand = buildCommand;
      if (startCommand) config.startCommand = startCommand;
    }

    if (selectedType === "cron") {
      config.schedule = schedule;
      config.targetType = "http";
      config.targetUrl = targetUrl;
    }

    const payload: Record<string, unknown> = {
      name,
      type: selectedType,
      config,
    };

    if (selectedType === "web" && selectedRepo) {
      payload.githubRepo = {
        owner: selectedRepo.owner,
        repo: selectedRepo.name,
        branch: gitBranch,
      };
      payload.autoDeploy = true;
    }

    try {
      const service = await api<{ id: string }>(`/projects/${projectId}/services`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast.success("Service created");
      router.push(`/dashboard/services/${service.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create service";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleTypeSelect(type: string) {
    setSelectedType(type);
    setStep(2);
    setError("");
  }

  const typeInfo = SERVICE_TYPES.find((t) => t.type === selectedType);

  return (
    <>
      <SetBreadcrumbs items={breadcrumbs} />
      <PageHeader
        title="Add Service"
        description="Choose a service type and configure it for your project"
      />

      <WizardStepper steps={WIZARD_STEPS} currentStep={step} />

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {SERVICE_TYPES.map((t) => (
            <ServiceTypeCard key={t.type} {...t} onClick={() => handleTypeSelect(t.type)} />
          ))}
        </div>
      )}

      {step === 2 && selectedType !== "web" && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle className="capitalize">{selectedType} Service</CardTitle>
            <CardDescription>{typeInfo?.detail}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="service-name">Service name</Label>
                <Input
                  id="service-name"
                  placeholder="my-database"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              {selectedType === "cron" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="schedule">Cron schedule</Label>
                    <Input
                      id="schedule"
                      placeholder="0 0 * * *"
                      value={schedule}
                      onChange={(e) => setSchedule(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Standard cron syntax. See{" "}
                      <a
                        href="https://crontab.guru"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline"
                      >
                        crontab.guru
                      </a>{" "}
                      for help.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="target-url">Target URL</Label>
                    <Input
                      id="target-url"
                      placeholder="https://api.example.com/cleanup"
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      The HTTP endpoint called on each schedule tick.
                    </p>
                  </div>
                </>
              )}

              {(selectedType === "postgres" || selectedType === "redis" || selectedType === "storage") && (
                <Alert>
                  <AlertDescription>
                    Connection credentials will be generated automatically after provisioning completes.
                  </AlertDescription>
                </Alert>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create Service"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {step === 2 && selectedType === "web" && (
        <div className="max-w-2xl space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select GitHub repository</CardTitle>
              <CardDescription>
                Choose a repo to deploy. Settings will be auto-detected from your codebase.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!githubConfigured && (
                <Alert variant="warning">
                  <AlertTitle>GitHub App not configured</AlertTitle>
                  <AlertDescription>
                    Contact your administrator to set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY.
                  </AlertDescription>
                </Alert>
              )}

              {githubConfigured && !githubConnected && (
                <Alert>
                  <AlertDescription className="flex flex-col gap-3">
                    <span>Connect your GitHub account to list repositories and auto-detect deploy settings.</span>
                    <Button asChild size="sm" className="w-fit">
                      <Link href={`/dashboard/settings/integrations?organizationId=${organizationId}`}>
                        Connect GitHub
                      </Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {githubConnected && (
                <>
                  <Input
                    placeholder="Search repositories..."
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                  />

                  {analyzing && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing repository...
                    </div>
                  )}

                  {loadingRepos ? (
                    <ListSkeleton rows={3} />
                  ) : (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {repos.map((repo) => (
                        <button
                          key={repo.id}
                          type="button"
                          onClick={() => selectRepo(repo)}
                          disabled={analyzing}
                          className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 disabled:opacity-50"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{repo.fullName}</span>
                            <div className="flex gap-2">
                              {repo.private && <Badge variant="secondary">Private</Badge>}
                              <Badge variant="outline">{repo.defaultBranch}</Badge>
                            </div>
                          </div>
                          {repo.description && (
                            <p className="mt-1 text-sm text-muted-foreground">{repo.description}</p>
                          )}
                        </button>
                      ))}
                      {repos.length === 0 && (
                        <p className="text-sm text-muted-foreground">No repositories found.</p>
                      )}
                    </div>
                  )}
                </>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Button type="button" variant="outline" onClick={() => setStep(1)}>
            Back
          </Button>
        </div>
      )}

      {step === 3 && selectedType === "web" && selectedRepo && analysis && (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Review & confirm</CardTitle>
            <CardDescription>
              Deploying <strong>{selectedRepo.fullName}</strong> — settings were auto-detected and can be edited.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {analysis.needsDockerfile && (
                <Alert variant="warning">
                  <AlertTitle>No Dockerfile found</AlertTitle>
                  <AlertDescription>
                    Add a Dockerfile to your repo before deploying, or set the path manually below.
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="web-name">Service name</Label>
                <Input id="web-name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={gitBranch} onValueChange={handleBranchChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(branches.length ? branches : [gitBranch]).map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {analysis.sources.gitBranch && (
                  <p className="text-xs text-muted-foreground">Detected from {analysis.sources.gitBranch}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="dockerfile">Dockerfile path</Label>
                <Input
                  id="dockerfile"
                  value={dockerfilePath}
                  onChange={(e) => setDockerfilePath(e.target.value)}
                />
                {analysis.sources.dockerfilePath && (
                  <p className="text-xs text-muted-foreground">Detected from {analysis.sources.dockerfilePath}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="port">Port</Label>
                <Input
                  id="port"
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value, 10))}
                />
                {analysis.sources.port && (
                  <p className="text-xs text-muted-foreground">Detected from {analysis.sources.port}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="build-cmd">Build command (optional)</Label>
                <Input id="build-cmd" value={buildCommand} onChange={(e) => setBuildCommand(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start-cmd">Start command (optional)</Label>
                <Input id="start-cmd" value={startCommand} onChange={(e) => setStartCommand(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="health">Health check path</Label>
                <Input
                  id="health"
                  value={healthCheckPath}
                  onChange={(e) => setHealthCheckPath(e.target.value)}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create & Deploy"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </>
  );
}
