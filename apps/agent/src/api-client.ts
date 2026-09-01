import { agentConfig } from "./config.js";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${agentConfig.apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${agentConfig.agentToken}`,
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${text}`);
  }

  return res.json() as Promise<T>;
}

export async function registerWorker() {
  return apiFetch("/agent/register", {
    method: "POST",
    body: JSON.stringify({
      workerId: agentConfig.workerId,
      hostname: agentConfig.hostname,
      capacity: {
        cpuCores: agentConfig.cpuCores,
        memoryMb: agentConfig.memoryMb,
        diskGb: agentConfig.diskGb,
      },
    }),
  });
}

export async function heartbeat() {
  return apiFetch("/agent/heartbeat", {
    method: "POST",
    body: JSON.stringify({ workerId: agentConfig.workerId }),
  });
}

export async function fetchTasks() {
  return apiFetch<Array<{
    id: string;
    serviceId: string;
    type: string;
    payload: Record<string, unknown>;
  }>>(`/agent/tasks?workerId=${agentConfig.workerId}`);
}

export async function fetchService(serviceId: string, deploymentId?: string) {
  const service = await apiFetch<ServiceDetail>(`/agent/services/${serviceId}`);
  if (deploymentId && !service.pendingDeployment) {
    service.pendingDeployment = {
      id: deploymentId,
      gitRef: null,
      imageTag: null,
    };
  }
  return service;
}

export async function reportStatus(data: {
  workerId: string;
  serviceId: string;
  status: string;
  message?: string;
  connectionInfo?: Record<string, string>;
  containerId?: string;
}) {
  return apiFetch("/agent/status", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateDeployment(
  deploymentId: string,
  data: Record<string, unknown>
) {
  return apiFetch(`/agent/deployments/${deploymentId}/status`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export interface ServiceDetail {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  config: Record<string, unknown>;
  connectionInfo: Record<string, string> | null;
  containerId: string | null;
  networkName: string | null;
  env: Record<string, string>;
  project: { slug: string; organization: { slug: string } };
  domains: Array<{ hostname: string; isPrimary: boolean }>;
  pendingDeployment: {
    id: string;
    gitRef: string | null;
    imageTag: string | null;
  } | null;
  cloneUrl?: string;
}
