const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("rkyves_token");
}

export function setToken(token: string) {
  localStorage.setItem("rkyves_token", token);
}

export function clearToken() {
  localStorage.removeItem("rkyves_token");
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
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Request failed");
  }

  return res.json();
}

export type Organization = { id: string; name: string; slug: string; role: string };
export type Project = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  serviceCount?: number;
};
export type Service = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  connectionInfo?: Record<string, string>;
  domains?: Array<{ hostname: string; isPrimary: boolean }>;
  worker?: { workerId: string; hostname: string; status: string };
};
