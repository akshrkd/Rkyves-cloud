"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Globe, Plus, Search, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SetBreadcrumbs } from "@/components/breadcrumb-provider";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/loading-skeleton";
import { PageHeader } from "@/components/page-header";
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
import { api, ApiError, Project, Service } from "@/lib/api";
import { truncate } from "@/lib/format";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data: project, isLoading, error, refetch } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api<Project & { services: Service[] }>(`/projects/${projectId}`),
  });

  const breadcrumbs = useMemo(
    () => [
      { label: "Home", href: "/dashboard" },
      { label: "Projects", href: "/dashboard/projects" },
      { label: project?.name ?? "Project" },
    ],
    [project?.name]
  );

  const filteredServices = useMemo(() => {
    if (!project) return [];
    const q = search.trim().toLowerCase();
    if (!q) return project.services;
    return project.services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.type.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q)
    );
  }, [project, search]);

  const stats = useMemo(() => {
    if (!project) return { total: 0, running: 0, failed: 0 };
    return {
      total: project.services.length,
      running: project.services.filter((s) => s.status === "running").length,
      failed: project.services.filter((s) => s.status === "failed").length,
    };
  }, [project]);

  async function deleteProject() {
    setDeleting(true);
    try {
      await api(`/projects/${projectId}`, { method: "DELETE" });
      toast.success("Project deleted");
      router.push("/dashboard/projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeleting(false);
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

  if (error || !project) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <>
        <SetBreadcrumbs items={breadcrumbs} />
        <ErrorState
          title={is404 ? "Project not found" : "Failed to load project"}
          message={error instanceof Error ? error.message : "Project could not be loaded"}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <SetBreadcrumbs items={breadcrumbs} />
      <PageHeader
        title={project.name}
        description={project.description ?? `Project slug: ${project.slug}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button asChild>
              <Link href={`/dashboard/projects/${projectId}/services/new`}>
                <Plus className="h-4 w-4" />
                Add Service
              </Link>
            </Button>
          </div>
        }
      />

      {project.services.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter services..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Badge variant="secondary">{stats.total} services</Badge>
          <Badge variant="success">{stats.running} running</Badge>
          {stats.failed > 0 && <Badge variant="danger">{stats.failed} failed</Badge>}
        </div>
      )}

      {project.services.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/projects/${projectId}/services/new?type=web`}>
              <Globe className="h-4 w-4" />
              Add Web Service
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/projects/${projectId}/services/new?type=postgres`}>
              Add Database
            </Link>
          </Button>
        </div>
      )}

      {project.services.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No services yet"
          description="Add a web app from GitHub, or provision Postgres, Redis, object storage, or cron jobs. Each service runs on your VM workers."
          action={{
            label: "Add your first service",
            href: `/dashboard/projects/${projectId}/services/new`,
          }}
        />
      ) : filteredServices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No services match &ldquo;{search}&rdquo;</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredServices.map((s) => (
            <Link key={s.id} href={`/dashboard/services/${s.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                  <div className="rounded-lg bg-muted p-2">
                    <ServiceIcon type={s.type} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{s.name}</CardTitle>
                      <StatusBadge status={s.status} />
                    </div>
                    <CardDescription className="uppercase">{s.type}</CardDescription>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-1 text-xs text-muted-foreground">
                  {s.worker && <p>Worker: {truncate(s.worker.hostname, 24)}</p>}
                  {s.domains?.find((d) => d.isPrimary) && (
                    <p className="truncate">{s.domains.find((d) => d.isPrimary)!.hostname}</p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              Type <strong>{project.name}</strong> to confirm. All services in this project will be deleted.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder={project.name}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirm !== project.name || deleting}
              onClick={deleteProject}
            >
              {deleting ? "Deleting..." : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
