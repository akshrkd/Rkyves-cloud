"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { api, Organization, Project } from "@/lib/api";

export default function DashboardPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const orgList = await api<Organization[]>("/orgs");
        setOrgs(orgList);
        if (orgList.length > 0) {
          setSelectedOrg(orgList[0].id);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedOrg) return;
    api<Project[]>(`/orgs/${selectedOrg}/projects`).then(setProjects);
  }, [selectedOrg]);

  async function createProject(e: FormEvent) {
    e.preventDefault();
    await api(`/orgs/${selectedOrg}/projects`, {
      method: "POST",
      body: JSON.stringify({ name: newName, slug: newSlug }),
    });
    setShowNewProject(false);
    setNewName("");
    setNewSlug("");
    const list = await api<Project[]>(`/orgs/${selectedOrg}/projects`);
    setProjects(list);
  }

  if (loading) {
    return (
      <Shell>
        <p className="text-slate-400">Loading...</p>
      </Shell>
    );
  }

  return (
    <Shell title="Projects">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-slate-400">Manage all Rkyves applications</p>
        </div>
        <button onClick={() => setShowNewProject(true)} className="btn-primary">
          New Project
        </button>
      </div>

      {orgs.length > 1 && (
        <select
          className="input mb-6 max-w-xs"
          value={selectedOrg}
          onChange={(e) => setSelectedOrg(e.target.value)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      )}

      {showNewProject && (
        <form onSubmit={createProject} className="card mb-6 space-y-4">
          <h2 className="font-semibold">Create Project</h2>
          <input
            className="input"
            placeholder="Project name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
            }}
            required
          />
          <input
            className="input"
            placeholder="Slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            required
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary">
              Create
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowNewProject(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link key={p.id} href={`/dashboard/projects/${p.id}`} className="card hover:border-brand-500">
            <h3 className="font-semibold text-white">{p.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{p.slug}</p>
            <p className="mt-3 text-xs text-slate-500">{p.serviceCount ?? 0} services</p>
          </Link>
        ))}
        {projects.length === 0 && (
          <p className="col-span-full text-slate-400">No projects yet. Create your first one.</p>
        )}
      </div>
    </Shell>
  );
}
