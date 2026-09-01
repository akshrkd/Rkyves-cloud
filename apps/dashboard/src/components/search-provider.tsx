"use client";

import { createContext, ReactNode, useCallback, useContext, useState } from "react";

type SearchContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const SearchContext = createContext<SearchContextValue>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
});

export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <SearchContext.Provider value={{ open, setOpen, toggle }}>{children}</SearchContext.Provider>
  );
}

export function useSearch() {
  return useContext(SearchContext);
}
