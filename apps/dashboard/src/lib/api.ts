const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("rkyves_token");
}

export function setToken(token: string) {
  localStorage.setItem("rkyves_token", token);
  document.cookie = `rkyves_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
}

export function clearToken() {
  localStorage.removeItem("rkyves_token");
  document.cookie = "rkyves_token=; path=/; max-age=0";
}

export function getSelectedOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("rkyves_org_id");
}

export function setSelectedOrgId(orgId: string) {
  localStorage.setItem("rkyves_org_id", orgId);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (res.status === 401) {
    const err = await res.json().catch(() => ({ error: "Unauthorized" }));
    const isLogin = path === "/auth/login" || path.endsWith("/auth/login");
    if (!isLogin) {
      clearToken();
      if (typeof window !== "undefined") window.location.href = "/login";
    }
    throw new ApiError(err.error ?? "Unauthorized", 401);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(err.error ?? "Request failed", res.status);
  }

  return res.json();
}

export type User = { id: string; email: string; name: string | null };
export type Organization = {
  id: string;
  name: string;
  slug: string;
  role: string;
  projectCount?: number;
  memberCount?: number;
};
export type Project = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  serviceCount?: number;
  organizationId?: string;
};
export type Service = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  config?: Record<string, unknown>;
  connectionInfo?: Record<string, string>;
  domains?: Array<{ id?: string; hostname: string; isPrimary: boolean; sslEnabled?: boolean }>;
  worker?: { workerId: string; hostname: string; status: string };
  project?: { id: string; name: string; slug: string; organizationId?: string };
};
export type Deployment = {
  id: string;
  status: string;
  gitRef: string | null;
  gitCommit?: string | null;
  buildLogs?: string | null;
  error?: string | null;
  startedAt: string;
  completedAt?: string | null;
};
export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};
export type Worker = {
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
export type EnvVar = {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
};
export type CronJob = {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  runs?: CronRun[];
};
export type CronRun = {
  id: string;
  status: string;
  logs?: string | null;
  error?: string | null;
  startedAt: string;
  completedAt?: string | null;
};
export type AuditLog = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  resourceName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userId: string | null;
};
export type OrgMember = {
  id: string;
  role: string;
  user: { id: string; email: string; name: string };
};
export type MetricSnapshot = {
  id: string;
  cpuPercent: number | null;
  memoryMb: number | null;
  diskGb: number | null;
  recordedAt: string;
};

export type OrgOverview = {
  projects: Project[];
  totalServices: number;
  runningServices: number;
  failedServices: number;
  workers: Worker[];
  onlineWorkers: number;
  githubConnected: boolean;
  recentDeployments: Array<
    Deployment & {
      serviceName: string;
      serviceId: string;
      projectName: string;
      projectId: string;
    }
  >;
};

export type SearchResult = {
  type: "project" | "service";
  id: string;
  name: string;
  subtitle: string;
  href?: string;
};
