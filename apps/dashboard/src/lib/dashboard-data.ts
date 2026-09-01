import { api, OrgOverview, SearchResult } from "./api";

export async function fetchOrgOverview(orgId: string): Promise<OrgOverview> {
  return api<OrgOverview>(`/orgs/${orgId}/overview`);
}

export async function fetchSearchIndex(orgId: string, q = ""): Promise<SearchResult[]> {
  const data = await api<{ results: SearchResult[] }>(
    `/orgs/${orgId}/search?q=${encodeURIComponent(q)}`
  );
  return data.results.map((r) => ({
    ...r,
    href: r.type === "project" ? `/dashboard/projects/${r.id}` : `/dashboard/services/${r.id}`,
  })) as SearchResult[];
}

export async function resolveInitialOrg(orgs: { id: string }[]): Promise<string> {
  if (orgs.length === 0) return "";
  const stored = typeof window !== "undefined" ? localStorage.getItem("rkyves_org_id") : null;
  if (stored && orgs.some((o) => o.id === stored)) return stored;
  return orgs[0].id;
}
