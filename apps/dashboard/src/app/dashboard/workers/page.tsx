"use client";

import { useEffect, useState } from "react";
import { Shell, StatusBadge } from "@/components/shell";
import { api } from "@/lib/api";

type Worker = {
  id: string;
  workerId: string;
  hostname: string;
  status: string;
  cpuCores: number;
  memoryMb: number;
  diskGb: number;
  lastSeenAt: string | null;
  serviceCount: number;
};

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);

  useEffect(() => {
    api<Worker[]>("/workers").then(setWorkers);
    const interval = setInterval(() => api<Worker[]>("/workers").then(setWorkers), 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Shell title="Workers">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Workers</h1>
        <p className="text-sm text-slate-400">
          VM agents that provision and run services. Add more VMs by deploying another agent with a unique WORKER_ID.
        </p>
      </div>

      <div className="grid gap-4">
        {workers.map((w) => (
          <div key={w.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{w.workerId}</h3>
                <p className="text-sm text-slate-400">{w.hostname}</p>
              </div>
              <StatusBadge status={w.status} />
            </div>
            <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-slate-500">CPU</p>
                <p>{w.cpuCores} cores</p>
              </div>
              <div>
                <p className="text-slate-500">Memory</p>
                <p>{Math.round(w.memoryMb / 1024)} GB</p>
              </div>
              <div>
                <p className="text-slate-500">Disk</p>
                <p>{w.diskGb} GB</p>
              </div>
              <div>
                <p className="text-slate-500">Services</p>
                <p>{w.serviceCount}</p>
              </div>
            </div>
            {w.lastSeenAt && (
              <p className="mt-3 text-xs text-slate-500">
                Last seen: {new Date(w.lastSeenAt).toLocaleString()}
              </p>
            )}
          </div>
        ))}
        {workers.length === 0 && (
          <p className="text-slate-400">No workers registered. Start the agent container on your VM.</p>
        )}
      </div>

      <div className="card mt-8">
        <h2 className="font-semibold">Add a Worker VM</h2>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300">
{`# On a new VM, run agent with unique worker ID:
WORKER_ID=worker-2 \\
AGENT_API_URL=https://api.rkyves.in \\
AGENT_TOKEN=your-token \\
docker compose up agent -d`}
        </pre>
      </div>
    </Shell>
  );
}
