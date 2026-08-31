"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Shell, ServiceIcon, StatusBadge } from "@/components/shell";
import { api, Project, Service } from "@/lib/api";

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<(Project & { services: Service[] }) | null>(null);

  useEffect(() => {
    api<Project & { services: Service[] }>(`/projects/${projectId}`).then(setProject);
  }, [projectId]);

  if (!project) {
    return (
      <Shell>
        <p className="text-slate-400">Loading...</p>
      </Shell>
    );
  }

  return (
    <Shell title={project.name}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">
            ← Projects
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
          <p className="text-sm text-slate-400">{project.description ?? project.slug}</p>
        </div>
        <Link href={`/dashboard/projects/${projectId}/services/new`} className="btn-primary">
          Add Service
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {project.services.map((s) => (
          <Link
            key={s.id}
            href={`/dashboard/services/${s.id}`}
            className="card flex items-start gap-4 hover:border-brand-500"
          >
            <ServiceIcon type={s.type} />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{s.name}</h3>
                <StatusBadge status={s.status} />
              </div>
              <p className="mt-1 text-xs uppercase text-slate-500">{s.type}</p>
              {s.worker && (
                <p className="mt-2 text-xs text-slate-500">Worker: {s.worker.workerId}</p>
              )}
            </div>
          </Link>
        ))}
        {project.services.length === 0 && (
          <p className="col-span-full text-slate-400">
            No services yet. Add Postgres, Redis, API, or Storage.
          </p>
        )}
      </div>
    </Shell>
  );
}
