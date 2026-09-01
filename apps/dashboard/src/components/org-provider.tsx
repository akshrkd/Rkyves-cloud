"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, Organization, getSelectedOrgId, setSelectedOrgId } from "@/lib/api";

type OrgContextValue = {
  orgs: Organization[];
  selectedOrg: string;
  setSelectedOrg: (id: string) => void;
  loading: boolean;
};

const OrgContext = createContext<OrgContextValue>({
  orgs: [],
  selectedOrg: "",
  setSelectedOrg: () => {},
  loading: true,
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrgState] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Organization[]>("/orgs")
      .then((list) => {
        setOrgs(list);
        const stored = getSelectedOrgId();
        const initial = stored && list.some((o) => o.id === stored) ? stored : list[0]?.id ?? "";
        setSelectedOrgState(initial);
        if (initial) setSelectedOrgId(initial);
      })
      .finally(() => setLoading(false));
  }, []);

  const setSelectedOrg = useCallback((id: string) => {
    setSelectedOrgState(id);
    setSelectedOrgId(id);
  }, []);

  return (
    <OrgContext.Provider value={{ orgs, selectedOrg, setSelectedOrg, loading }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
