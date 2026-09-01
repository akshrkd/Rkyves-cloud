"use client";

import { useEffect } from "react";
import { useOrg } from "@/components/org-provider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export { useOrg } from "@/components/org-provider";

export function OrgSwitcher() {
  const { orgs, selectedOrg, setSelectedOrg, loading } = useOrg();

  if (loading || orgs.length <= 1) return null;

  return (
    <div className="hidden items-center gap-2 md:flex">
      <Label className="sr-only">Organization</Label>
      <Select value={selectedOrg} onValueChange={setSelectedOrg}>
        <SelectTrigger className="h-8 w-40">
          <SelectValue placeholder="Organization" />
        </SelectTrigger>
        <SelectContent>
          {orgs.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function useOrgEvents(onEvent: (payload: Record<string, unknown>) => void) {
  const { selectedOrg } = useOrg();

  useEffect(() => {
    if (!selectedOrg) return;
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    const token = localStorage.getItem("rkyves_token");
    if (!token) return;

    const url = `${API_URL}/events/stream?organizationId=${selectedOrg}&token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.event && parsed.event !== "ping") onEvent(parsed);
      } catch {
        /* ignore */
      }
    };

    return () => es.close();
  }, [selectedOrg, onEvent]);
}
