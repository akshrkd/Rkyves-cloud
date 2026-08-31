"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Shell, ServiceIcon, StatusBadge } from "@/components/shell";
import { api, Service } from "@/lib/api";

type ServiceDetail = Service & {
  project: { id: string; name: string; slug: string };
  envVars: Array<{ id: string; key: string; isSecret: boolean }>;
  deployments: Array<{ id: string; status: string; gitRef: string | null; startedAt: string }>;
  cronJobs?: Array<{ id: string; name: string; schedule: string; enabled: boolean }>;
};

export default function ServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const [service, setService] = useState<ServiceDetail | null>(null);
  const [envKey, setEnvKey] = useState("");
  const [envValue, setEnvValue] = useState("");
  const [domain, setDomain] = useState("");
  const [tab, setTab] = useState<"overview" | "env" | "deploy" | "cron">("overview");

  async function reload() {
    const data = await api<ServiceDetail>(`/services/${serviceId}`);
    setService(data);
  }

  useEffect(() => {
    reload();
    const interval = setInterval(reload, 5000);
    return () => clearInterval(interval);
  }, [serviceId]);

  async function addEnv(e: FormEvent) {
    e.preventDefault();
    await api(`/services/${serviceId}/env`, {
      method: "POST",
      body: JSON.stringify({ key: envKey, value: envValue, isSecret: true }),
    });
    setEnvKey("");
    setEnvValue("");
    reload();
  }

  async function addDomain(e: FormEvent) {
    e.preventDefault();
    await api(`/services/${serviceId}/domains`, {
      method: "POST",
      body: JSON.stringify({ hostname: domain, isPrimary: true }),
    });
    setDomain("");
    reload();
  }

  async function triggerDeploy() {
    await api(`/services/${serviceId}/deploy`, { method: "POST", body: "{}" });
    reload();
  }

  if (!service) {
    return (
      <Shell>
        <p className="text-slate-400">Loading...</p>
      </Shell>
    );
  }

  return (
    <Shell title={service.name}>
      <Link
        href={`/dashboard/projects/${service.project.id}`}
        className="text-sm text-slate-400 hover:text-white"
      >
        ← {service.project.name}
      </Link>

      <div className="mt-4 flex items-center gap-4">
        <ServiceIcon type={service.type} />
        <div>
          <h1 className="text-2xl font-bold">{service.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={service.status} />
            <span className="text-sm uppercase text-slate-500">{service.type}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-2 border-b border-slate-800">
        {(["overview", "env", "deploy", "cron"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm capitalize ${tab === t ? "border-b-2 border-brand-500 text-white" : "text-slate-400"}`}
          >
            {t === "env" ? "Env Vars" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="card mt-6 space-y-4">
          <h2 className="font-semibold">Connection Info</h2>
          {service.connectionInfo ? (
            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-emerald-400">
              {JSON.stringify(service.connectionInfo, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-slate-400">Provisioning... connection info will appear when ready.</p>
          )}

          {service.domains && service.domains.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400">Domains</h3>
              <ul className="mt-2 space-y-1">
                {service.domains.map((d) => (
                  <li key={d.hostname} className="text-sm text-white">
                    {d.hostname} {d.isPrimary && <span className="text-xs text-slate-500">(primary)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {service.type === "web" && (
            <form onSubmit={addDomain} className="flex gap-2">
              <input className="input flex-1" placeholder="api.myapp.rkyves.in" value={domain} onChange={(e) => setDomain(e.target.value)} />
              <button type="submit" className="btn-secondary">Add Domain</button>
            </form>
          )}

          {service.worker && (
            <p className="text-xs text-slate-500">
              Worker: {service.worker.workerId} ({service.worker.hostname}) — {service.worker.status}
            </p>
          )}
        </div>
      )}

      {tab === "env" && (
        <div className="card mt-6 space-y-4">
          <h2 className="font-semibold">Environment Variables</h2>
          <ul className="space-y-2">
            {service.envVars.map((v) => (
              <li key={v.id} className="flex justify-between rounded bg-slate-950 px-3 py-2 text-sm">
                <span className="font-mono text-brand-500">{v.key}</span>
                <span className="text-slate-500">{v.isSecret ? "••••••••" : "visible"}</span>
              </li>
            ))}
          </ul>
          <form onSubmit={addEnv} className="flex gap-2">
            <input className="input" placeholder="KEY" value={envKey} onChange={(e) => setEnvKey(e.target.value)} required />
            <input className="input flex-1" placeholder="value" value={envValue} onChange={(e) => setEnvValue(e.target.value)} required />
            <button type="submit" className="btn-primary">Add</button>
          </form>
        </div>
      )}

      {tab === "deploy" && service.type === "web" && (
        <div className="card mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Deployments</h2>
            <button onClick={triggerDeploy} className="btn-primary">Deploy Now</button>
          </div>
          <ul className="space-y-2">
            {service.deployments.map((d) => (
              <li key={d.id} className="flex items-center justify-between rounded bg-slate-950 px-3 py-2 text-sm">
                <span>{d.gitRef ?? "manual"}</span>
                <StatusBadge status={d.status} />
              </li>
            ))}
            {service.deployments.length === 0 && (
              <p className="text-sm text-slate-400">No deployments yet.</p>
            )}
          </ul>
        </div>
      )}

      {tab === "cron" && service.type === "cron" && (
        <div className="card mt-6">
          <h2 className="font-semibold">Cron Jobs</h2>
          <ul className="mt-4 space-y-2">
            {(service.cronJobs ?? []).map((j) => (
              <li key={j.id} className="rounded bg-slate-950 px-3 py-2 text-sm">
                <span className="font-mono">{j.schedule}</span> — {j.name}{" "}
                {j.enabled ? <span className="text-emerald-400">enabled</span> : <span className="text-slate-500">disabled</span>}
              </li>
            ))}
            {(service.cronJobs ?? []).length === 0 && (
              <p className="text-sm text-slate-400">Cron jobs configured at service creation.</p>
            )}
          </ul>
        </div>
      )}
    </Shell>
  );
}
