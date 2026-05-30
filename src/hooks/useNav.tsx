/**
 * useNav.tsx — Simple navigation context for profile viewing
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type Page = 
  | { type: "feed" }
  | { type: "network" }
  | { type: "jobs" }
  | { type: "messaging" }
  | { type: "notifications" }
  | { type: "profile"; pubkey?: string };  // no pubkey = own profile

interface NavState {
  page: Page;
  navigate: (page: Page) => void;
  viewProfile: (pubkey: string) => void;
  goHome: () => void;
}

const NavContext = createContext<NavState | null>(null);

export function useNav(): NavState {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [page, setPage] = useState<Page>({ type: "feed" });

  const navigate = useCallback((p: Page) => setPage(p), []);
  const viewProfile = useCallback((pubkey: string) => setPage({ type: "profile", pubkey }), []);
  const goHome = useCallback(() => setPage({ type: "feed" }), []);

  return (
    <NavContext.Provider value={{ page, navigate, viewProfile, goHome }}>
      {children}
    </NavContext.Provider>
  );
}
