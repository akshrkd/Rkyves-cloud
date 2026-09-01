"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, FolderKanban, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { SetBreadcrumbs } from "@/components/breadcrumb-provider";
import { useOrg } from "@/components/org-provider";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { PageSkeleton } from "@/components/loading-skeleton";
import { PageHeader } from "@/components/page-header";
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
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, Project } from "@/lib/api";

export default function ProjectsPage() {
  const { selectedOrg, loading: orgLoading } = useOrg();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const breadcrumbs = useMemo(
    () => [{ label: "Home", href: "/dashboard" }, { label: "Projects" }],
    []
  );

  const {
    data: projects = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["projects", selectedOrg],
    queryFn: () => api<Project[]>(`/orgs/${selectedOrg}/projects`),
    enabled: Boolean(selectedOrg),
  });

  async function createProject(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api(`/orgs/${selectedOrg}/projects`, {
        method: "POST",
        body: JSON.stringify({
          name: newName,
          slug: newSlug,
          ...(newDescription.trim() ? { description: newDescription.trim() } : {}),
        }),
      });
      setDialogOpen(false);
      setNewName("");
      setNewSlug("");
      setNewDescription("");
      await queryClient.invalidateQueries({ queryKey: ["projects", selectedOrg] });
      toast.success("Project created successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)
    );
  }, [projects, search]);

  if (orgLoading || (isLoading && !projects.length)) {
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
      <PageHeader
        title="Projects"
        description="Organize apps, databases, and services into projects"
        action={
          <Button onClick={() => setDialogOpen(true)} disabled={!selectedOrg}>
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        }
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="project-search"
            placeholder="Filter projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Projects group related services together — like a web API, its database, and cache. Create your first project to start deploying."
          action={{ label: "Create your first project", onClick: () => setDialogOpen(true) }}
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects match &ldquo;{search}&rdquo;</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link key={p.id} href={`/dashboard/projects/${p.id}`}>
              <Card className="transition-colors hover:border-primary/50">
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-muted p-2">
                      <FolderKanban className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      <CardDescription>{p.slug}</CardDescription>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  {p.description && (
                    <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                  )}
                  <Badge variant="secondary">{p.serviceCount ?? 0} services</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={createProject}>
            <DialogHeader>
              <DialogTitle>Create Project</DialogTitle>
              <DialogDescription>
                A project groups services that work together, such as an API and its database.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  placeholder="My Application"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="project-slug">Slug</Label>
                  <Tooltip>
                    <TooltipTrigger type="button" className="text-xs text-muted-foreground underline">
                      What is this?
                    </TooltipTrigger>
                    <TooltipContent>
                      Used in URLs and internal identifiers. Lowercase letters, numbers, and hyphens only.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="project-slug"
                  placeholder="my-application"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-desc">Description (optional)</Label>
                <Textarea
                  id="project-desc"
                  placeholder="Brief description of this project"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
