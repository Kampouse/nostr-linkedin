/**
 * KeepAlive.tsx — Keeps child pages mounted when off-screen.
 * 
 * Pattern: parent wraps each page in <KeepAlive id="feed">
 * When a different page is active, inactive ones get display:none
 * but stay mounted in the DOM — state, scroll, fetched data all persist.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";

// ── Context ──
interface KeepAliveContext {
  activeId: string;
  activate: (id: string) => void;
}

const Ctx = createContext<KeepAliveContext>({
  activeId: "",
  activate: () => {},
});

export function useKeepAliveContext() {
  return useContext(Ctx);
}

// ── Provider ──
export function KeepAliveProvider({
  initialId,
  children,
}: {
  initialId: string;
  children: ReactNode;
}) {
  const [activeId, setActiveId] = useState(initialId);
  const activate = useCallback((id: string) => setActiveId(id), []);

  return (
    <Ctx.Provider value={{ activeId, activate }}>
      {children}
    </Ctx.Provider>
  );
}

// ── KeepAlive slot ──
// Renders children always. Hides via display:none when not active.
export function KeepAlive({ id, children }: { id: string; children: ReactNode }) {
  const { activeId } = useKeepAliveContext();

  return (
    <div
      data-keepalive={id}
      style={{
        display: activeId === id ? "contents" : "none",
      }}
    >
      {children}
    </div>
  );
}
