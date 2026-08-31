"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Shell, ServiceIcon } from "@/components/shell";
import { api } from "@/lib/api";

const SERVICE_TYPES = [
  { type: "web", label: "Web / API", desc: "Deploy from Git with Traefik routing" },
  { type: "postgres", label: "Postgres", desc: "Managed database with PgBouncer pooling" },
  { type: "redis", label: "Redis", desc: "In-memory cache and job queue" },
  { type: "storage", label: "Object Storage", desc: "S3-compatible MinIO bucket" },
  { type: "cron", label: "Cron Jobs", desc: "Scheduled HTTP or container tasks" },
] as const;

export default function NewServicePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedType, setSelectedType] = useState<string>("");
  const [name, setName] = useState("");
  const [gitRepo, setGitRepo] = useState("");
  const [schedule, setSchedule] = useState("0 0 * * *");
  const [targetUrl, setTargetUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const config: Record<string, unknown> = {};
    if (selectedType === "web" && gitRepo) config.gitRepo = gitRepo;
    if (selectedType === "cron") {
      config.schedule = schedule;
      config.targetType = "http";
      config.targetUrl = targetUrl;
    }

    try {
      const service = await api<{ id: string }>(`/projects/${projectId}/services`, {
        method: "POST",
        body: JSON.stringify({ name, type: selectedType, config }),
      });
      router.push(`/dashboard/services/${service.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create service");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell title="New Service">
      <Link href={`/dashboard/projects/${projectId}`} className="text-sm text-slate-400 hover:text-white">
        ← Back to project
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Add Service</h1>

      {step === 1 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {SERVICE_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => {
                setSelectedType(t.type);
                setStep(2);
              }}
              className="card flex items-start gap-4 text-left hover:border-brand-500"
            >
              <ServiceIcon type={t.type} />
              <div>
                <h3 className="font-semibold">{t.label}</h3>
                <p className="mt-1 text-sm text-slate-400">{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <form onSubmit={handleSubmit} className="card mt-6 max-w-lg space-y-4">
          <h2 className="font-semibold capitalize">{selectedType} service</h2>
          <input
            className="input"
            placeholder="Service name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          {selectedType === "web" && (
            <input
              className="input"
              placeholder="Git repository URL (optional)"
              value={gitRepo}
              onChange={(e) => setGitRepo(e.target.value)}
            />
          )}

          {selectedType === "cron" && (
            <>
              <input
                className="input"
                placeholder="Cron schedule (e.g. 0 0 * * *)"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                required
              />
              <input
                className="input"
                placeholder="Target URL"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                required
              />
            </>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Creating..." : "Create Service"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}
