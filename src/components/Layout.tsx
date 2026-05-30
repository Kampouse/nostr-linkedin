/**
 * Layout.tsx — LinkedIn top nav + conditional layout
 * Uses react-router for navigation. Detects route to choose 3-col vs wide.
 */

import { type ReactNode, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useLocation, Link } from "react-router-dom";
import {
  Home, Users, Briefcase, MessageCircle, Bell, Search,
  LogOut, Zap, Plug, Key, UserCircle, Copy, Eye, EyeOff, Loader2, CheckCircle, XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../hooks/useAuth";
import {
  shortenPubkey, npubFromHex, hexFromNpub, searchCachedProfiles, fastQuery,
  SEARCH_RELAYS,
  type UserProfile,
} from "../lib/nostr";
import { nip19 } from "nostr-tools";

type LoginTab = "signer" | "extension" | "nsec" | "npub";

// Routes that use the 3-column feed layout
const FEED_ROUTES = ["/", "/feed"];

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, pubkey, disconnect, connectUri, startConnect, cancelConnect,
    loginNip07, loginNsec, loginNpub, loading: authLoading, error: authError,
    sessionAlive, signer } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<(UserProfile & { pubkey: string })[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Login state for Me menu
  const [loginTab, setLoginTab] = useState<LoginTab>("signer");
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [nip07Available] = useState(() => !!(window as any).nostr);

  // Close menu on outside click
  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close search on route change — nuke everything
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = undefined;
    setSearchOpen(false);
    setSearchResults([]);
    setSearchQ("");
  }, [location.pathname]);

  // Search handler
  const handleSearch = useCallback((q: string) => {
    setSearchQ(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (!q.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    // Direct navigation for npub/note/nevent/nsec
    const trimmed = q.trim();
    if (trimmed.startsWith("npub1") || trimmed.startsWith("nprofile1")) {
      try {
        const decoded = nip19.decode(trimmed);
        const hex = (decoded.data as any)?.pubkey || (decoded.data as any)?.hex || decoded.data as string;
        if (hex && /^[0-9a-f]{64}$/.test(hex)) {
          navigate(`/in/${npubFromHex(hex)}`);
          setSearchOpen(false);
          return;
        }
      } catch {}
    }
    if (trimmed.startsWith("note1") || trimmed.startsWith("nevent1")) {
      try {
        const decoded = nip19.decode(trimmed);
        const id = (decoded.data as any)?.id || (decoded.data as any)?.hex || decoded.data as string;
        if (id) {
          navigate(`/post/${id}`);
          setSearchOpen(false);
          return;
        }
      } catch {}
    }
    if (trimmed.startsWith("nsec1")) return; // don't search for nsec

    // Instant search from local profile cache
    const cached = searchCachedProfiles(trimmed);
    setSearchResults(cached);
    setSearchOpen(cached.length > 0);

    // Also query NIP-50 search relay (async enhancement)
    searchTimer.current = setTimeout(async () => {
      try {
        const events = await fastQuery(SEARCH_RELAYS, {
          kinds: [0],
          search: trimmed,
          limit: 8,
        }, 3000);
        const relayProfiles = new Map<string, UserProfile>();
        for (const ev of events) {
          try {
            const p = JSON.parse(ev.content);
            if (p.name || p.display_name) relayProfiles.set(ev.pubkey, p);
          } catch {}
        }
        // Merge: dedupe by pubkey, keep cache profile if already there
        const merged = new Map<string, UserProfile & { pubkey: string }>();
        for (const r of cached) merged.set(r.pubkey, r);
        for (const [pk, p] of relayProfiles.entries()) {
          if (!merged.has(pk)) merged.set(pk, { ...p, pubkey: pk });
        }
        const results = [...merged.values()];
        const lower = trimmed.toLowerCase();
        results.sort((a, b) => {
          const aName = (a.display_name || a.name || "").toLowerCase();
          const bName = (b.display_name || b.name || "").toLowerCase();
          return (aName.startsWith(lower) ? 0 : 1) - (bName.startsWith(lower) ? 0 : 1);
        });
        setSearchResults(results.slice(0, 8));
        setSearchOpen(results.length > 0);
      } catch { /* relay search failed, keep cache results */ }
    }, 300);
  }, [navigate]);
  const name = profile?.display_name || profile?.name || (pubkey ? shortenPubkey(pubkey) : "Sign in");
  const pic = profile?.picture;
  const isFeed = FEED_ROUTES.includes(location.pathname);
  const myNpub = pubkey ? npubFromHex(pubkey) : "";

  // Determine active nav from route
  const getActive = (): string => {
    const p = location.pathname;
    if (p === "/" || p === "/feed") return "feed";
    if (p.startsWith("/network")) return "network";
    if (p.startsWith("/jobs")) return "jobs";
    if (p.startsWith("/messaging")) return "messaging";
    if (p.startsWith("/notifications")) return "notifications";
    if (p.startsWith("/in")) return "profile";
    return "feed";
  };
  const active = getActive();

  const navItems: { id: string; icon: typeof Home; label: string; path: string }[] = [
    { id: "feed", icon: Home, label: "Home", path: "/" },
    { id: "network", icon: Users, label: "My Network", path: "/network" },
    { id: "jobs", icon: Briefcase, label: "Jobs", path: "/jobs" },
    { id: "messaging", icon: MessageCircle, label: "Messaging", path: "/messaging" },
    { id: "notifications", icon: Bell, label: "Notifications", path: "/notifications" },
  ];

  const allNavItems = [
    ...navItems,
    { id: "profile", icon: null as any, label: pubkey ? "Me" : "Sign in", path: pubkey ? `/in/${myNpub}` : "#" },
  ];

  return (
    <>
      {/* ── Reconnecting banner ── */}
      {pubkey && signer && !sessionAlive && (
        <div style={{
          background: '#78350f', color: '#fde68a', textAlign: 'center',
          padding: '6px 12px', fontSize: '13px', fontWeight: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <Loader2 size={14} className="spin" /> Reconnecting to signer…
        </div>
      )}
      {/* ── Top Nav (desktop) / slim header (mobile) ── */}
      <nav className="global-nav">
        <div className="global-nav-inner">
          <div className="nav-left">
            <Link to="/" className="nav-logo" style={{ textDecoration: 'none' }}>⟠</Link>
            <div className="nav-search" ref={searchRef} style={{ position: "relative" }}>
              <Search size={16} className="nav-search-icon" />
              <input
                type="text"
                placeholder="Search by name or paste npub/note"
                value={searchQ}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                onKeyDown={e => {
                  if (e.key === "Enter" && searchQ.trim()) handleSearch(searchQ);
                }}
              />
              {searchOpen && searchResults.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0,
                  background: "var(--surface)", border: "1px solid var(--surface-border)",
                  borderRadius: 8, marginTop: 4, maxHeight: 400, overflowY: "auto",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)", zIndex: 1100,
                }}>
                  {searchResults.map(r => (
                    <Link
                      key={r.pubkey}
                      to={`/in/${npubFromHex(r.pubkey)}`}
                      onClick={() => { 
                        if (searchTimer.current) clearTimeout(searchTimer.current);
                        setSearchOpen(false); 
                        setSearchQ(""); 
                        (document.activeElement as HTMLElement)?.blur(); 
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 16px", textDecoration: "none", color: "var(--text)",
                        borderBottom: "1px solid var(--surface-border)",
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                        background: r.picture ? `url(${r.picture}) center/cover` : "linear-gradient(135deg, #10b981, #059669)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 600, fontSize: 14,
                      }}>
                        {r.picture ? "" : (r.display_name || r.name || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{r.display_name || r.name}</div>
                        {r.about && <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.about.slice(0, 60)}</div>}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="nav-right">
            {navItems.map(({ id, icon: Icon, label, path }) => (
              <Link
                key={id}
                to={path}
                className={`nav-item ${active === id ? "active" : ""}`}
              >
                <Icon size={20} />
                <span className="nav-item-label">{label}</span>
              </Link>
            ))}
            <div ref={menuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className={`nav-item ${active === "profile" ? "active" : ""}`}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <div className="nav-logo" style={{ width: 24, height: 24, fontSize: 12, borderRadius: '50%' }}>
                  {pic ? (
                    <img src={pic} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <span className="nav-item-label">{pubkey ? "Me ▾" : "Sign in ▾"}</span>
              </button>
              {menuOpen && (
                <div style={{
                  position: "absolute", right: 0, top: "100%", zIndex: 1100,
                  background: "var(--surface)", border: "1px solid var(--surface-border)",
                  borderRadius: 8, minWidth: pubkey ? 220 : 300, padding: "4px 0",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                }}>
                  {pubkey ? (
                    <>
                      <Link to={`/in/${myNpub}`} onClick={() => setMenuOpen(false)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", textDecoration: "none", color: "var(--text)", fontSize: 14 }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: pic ? `url(${pic}) center/cover` : "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
                          {pic ? "" : name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{name}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>View profile</div>
                        </div>
                      </Link>
                      <div style={{ borderTop: "1px solid var(--surface-border)", margin: "4px 0" }} />
                      <button
                        onClick={() => { setMenuOpen(false); disconnect(); navigate("/"); }}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", background: "none", border: "none", color: "var(--text)", fontSize: 14, cursor: "pointer", textAlign: "left" }}
                      >
                        <LogOut size={16} color="var(--text-muted)" /> Sign out
                      </button>
                    </>
                  ) : (
                    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {authError && <div style={{ background: "#2a1010", color: "#ef4444", padding: "8px 12px", borderRadius: 4, fontSize: 12, border: "1px solid #4a1515" }}>{authError}</div>}
                      {nip07Available && (
                        <button onClick={() => { loginNip07(); }} disabled={authLoading} style={{ width: "100%", padding: "10px 16px", borderRadius: 8, background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <Plug size={16} /> Connect Extension
                        </button>
                      )}
                      <button onClick={() => { startConnect(); }} disabled={authLoading} style={{ width: "100%", padding: "10px 16px", borderRadius: 8, background: "transparent", border: "1px solid var(--surface-border)", color: "var(--text)", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <Zap size={16} /> NIP-46 Signer
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── Bottom Tab Bar (mobile only) ── */}
      <div className="mobile-tab-bar">
        {allNavItems.map(({ id, icon: Icon, label, path }) => {
          if (id === "profile") {
            return (
              <button
                key={id}
                onClick={() => setMenuOpen(!menuOpen)}
                className={`mobile-tab-item ${active === id ? "active" : ""}`}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <div className="mobile-tab-avatar">
                  {pic ? <img src={pic} alt="" /> : name.slice(0, 1).toUpperCase()}
                </div>
                <span>Me</span>
              </button>
            );
          }
          return (
            <Link
              key={id}
              to={path}
              className={`mobile-tab-item ${active === id ? "active" : ""}`}
            >
              {Icon && <Icon size={22} />}
              <span>{label === "My Network" ? "Network" : label}</span>
            </Link>
          );
        })}
      </div>

      {/* ── Mobile full-screen menu (portal to body) ── */}
      {menuOpen && createPortal(
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: "var(--bg)", display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 20px", borderBottom: "1px solid var(--surface-border)",
            paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
          }}>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{pubkey ? "Account" : "Sign in"}</span>
            <button onClick={() => setMenuOpen(false)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 24, padding: 0 }}>✕</button>
          </div>

          {pubkey ? (
            /* ── Logged in: Profile + QR + Sign out ── */
            <>
              {/* Profile */}
              <Link to={`/in/${myNpub}`} onClick={() => setMenuOpen(false)} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 24px 24px", textDecoration: "none", color: "inherit" }}>
                <div style={{
                  width: 80, height: 80, borderRadius: "50%",
                  background: pic ? `url(${pic}) center/cover` : "linear-gradient(135deg, #10b981, #059669)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff", fontWeight: 700, fontSize: 32,
                }}>
                  {pic ? "" : name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 16 }}>{name}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, fontFamily: "monospace" }}>
                  {myNpub.slice(0, 24)}…{myNpub.slice(-8)}
                </div>
              </Link>

              {/* QR Code — tappable link to profile */}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                padding: "0 24px 24px",
              }}>
                <Link
                  to={`/in/${myNpub}`}
                  onClick={() => setMenuOpen(false)}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div style={{
                    background: "#141414", borderRadius: 16, padding: 20,
                    border: "1px solid var(--surface-border)",
                    cursor: "pointer",
                    transition: "border-color 0.15s",
                  }}>
                    <QRCodeSVG
                      value={`https://in.jemartel.dev/in/${myNpub}`}
                      size={180}
                      bgColor="#141414"
                      fgColor="#10b981"
                      level="M"
                    />
                  </div>
                </Link>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 12, textAlign: "center" }}>
                  Tap to open or scan to share
                </div>
              </div>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Sign out */}
              <div style={{ borderTop: "1px solid var(--surface-border)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
                <button
                  onClick={() => { setMenuOpen(false); disconnect(); navigate("/"); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%",
                    padding: "18px 20px", background: "none", border: "none",
                    color: "#ef4444", fontSize: 17, cursor: "pointer", fontWeight: 500,
                  }}
                >
                  <LogOut size={20} />
                  <span>Sign out</span>
                </button>
              </div>
            </>
          ) : (
            /* ── Logged out: Login interface ── */
            <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
              {/* Hero */}
              <div style={{
                background: "linear-gradient(135deg, #064e3b, #065f46, #047857)",
                padding: "40px 24px 32px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 36, fontWeight: 700, color: "#fff", marginBottom: 6 }}>⟠ NostrLink</div>
                <div style={{ fontSize: 15, color: "rgba(255,255,255,0.7)" }}>Professional networking, decentralized.</div>
              </div>

              <div style={{ padding: "24px" }}>
                {authError && <div style={{ background: "#2a1010", color: "#ef4444", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16, border: "1px solid #4a1515" }}>{authError}</div>}

                {/* QR Pairing active */}
                {connectUri ? (
                  <div style={{ textAlign: "center" }}>
                    {/* Status indicator */}
                    {authError ? (
                      /* ── Error state ── */
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#2a1010", border: "2px solid #ef4444", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                          <XCircle size={32} color="#ef4444" />
                        </div>
                        <p style={{ fontSize: 17, fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>Connection failed</p>
                        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.5 }}>{authError}</p>
                      </div>
                    ) : (
                      /* ── Waiting state ── */
                      <div style={{ marginBottom: 20 }}>
                        <div className="pulse-ring" style={{ display: "inline-block", padding: 16, border: "2px solid var(--accent)", borderRadius: 16, marginBottom: 16, background: "#fff", position: "relative" }}>
                          <QRCodeSVG value={connectUri} size={200} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
                          <Loader2 size={16} color="var(--accent)" className="spin" />
                          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--accent)" }}>Waiting for signer...</p>
                        </div>
                        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Scan with Primal, Clave, or Amber</p>
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Deep-link into signer app */}
                      {!authError && (
                        <button
                          onClick={() => { window.location.href = connectUri; }}
                          style={{ width: "100%", padding: "14px 16px", borderRadius: 24, background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                        >
                          <Zap size={18} /> Open Signer App
                        </button>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => navigator.clipboard.writeText(connectUri).catch(() => {})} style={{ flex: 1, padding: "12px", borderRadius: 24, background: "transparent", border: "1px solid var(--surface-border)", color: "var(--text)", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <Copy size={16} /> Copy URI
                        </button>
                        <button onClick={() => { cancelConnect(); setLoginTab("signer"); }} style={{ flex: 1, padding: "12px", borderRadius: 24, background: "transparent", border: "1px solid var(--surface-border)", color: "var(--text-muted)", fontSize: 14, cursor: "pointer" }}>
                          {authError ? "Try again" : "Cancel"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Tabs */}
                    <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: "1px solid var(--surface-border)" }}>
                      <button onClick={() => setLoginTab("signer")} style={{ flex: 1, padding: "10px 4px", background: "none", border: "none", borderBottom: loginTab === "signer" ? "2px solid var(--accent)" : "2px solid transparent", color: loginTab === "signer" ? "var(--accent)" : "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Zap size={14} /> Signer
                      </button>
                      {nip07Available && (
                        <button onClick={() => setLoginTab("extension")} style={{ flex: 1, padding: "10px 4px", background: "none", border: "none", borderBottom: loginTab === "extension" ? "2px solid var(--accent)" : "2px solid transparent", color: loginTab === "extension" ? "var(--accent)" : "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                          <Plug size={14} /> Extension
                        </button>
                      )}
                      <button onClick={() => setLoginTab("nsec")} style={{ flex: 1, padding: "10px 4px", background: "none", border: "none", borderBottom: loginTab === "nsec" ? "2px solid var(--accent)" : "2px solid transparent", color: loginTab === "nsec" ? "var(--accent)" : "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <Key size={14} /> nsec
                      </button>
                      <button onClick={() => setLoginTab("npub")} style={{ flex: 1, padding: "10px 4px", background: "none", border: "none", borderBottom: loginTab === "npub" ? "2px solid var(--accent)" : "2px solid transparent", color: loginTab === "npub" ? "var(--accent)" : "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                        <UserCircle size={14} /> npub
                      </button>
                    </div>

                    {/* Signer tab */}
                    {loginTab === "signer" && (
                      <div>
                        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>Scan a QR code with your Nostr signer app (Clave, Amber, Primal) via NIP-46.</p>
                        <button onClick={startConnect} disabled={authLoading} style={{ width: "100%", padding: "14px 16px", borderRadius: 24, background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 600, border: "none", cursor: authLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: authLoading ? 0.7 : 1 }}>
                          {authLoading ? <Loader2 size={18} className="spin" /> : <Zap size={18} />} {authLoading ? "Connecting..." : "Connect with Signer"}
                        </button>
                      </div>
                    )}

                    {/* Extension tab */}
                    {loginTab === "extension" && (
                      <div>
                        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>Use your browser extension (Alby, nos2x) to sign in.</p>
                        <button onClick={loginNip07} disabled={authLoading} style={{ width: "100%", padding: "14px 16px", borderRadius: 24, background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 600, border: "none", cursor: authLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: authLoading ? 0.7 : 1 }}>
                          {authLoading ? <Loader2 size={18} className="spin" /> : <Plug size={18} />} {authLoading ? "Connecting..." : "Connect with Extension"}
                        </button>
                      </div>
                    )}

                    {/* nsec tab */}
                    {loginTab === "nsec" && (
                      <div>
                        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>Enter your private key. Key stays in browser memory only.</p>
                        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                          <input
                            type={showKey ? "text" : "password"}
                            placeholder="nsec1..."
                            value={keyInput}
                            onChange={e => setKeyInput(e.target.value)}
                            style={{ flex: 1, padding: "12px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text)", fontSize: 14, outline: "none" }}
                          />
                          <button onClick={() => setShowKey(!showKey)} style={{ padding: "0 10px", background: "none", border: "1px solid var(--surface-border)", borderRadius: 8, color: "var(--text-muted)", cursor: "pointer" }}>
                            {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                        <button onClick={() => loginNsec(keyInput)} disabled={authLoading || !keyInput.trim()} style={{ width: "100%", padding: "14px 16px", borderRadius: 24, background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 600, border: "none", cursor: authLoading || !keyInput.trim() ? "not-allowed" : "pointer", opacity: keyInput.trim() ? 1 : 0.5 }}>
                          Sign in with nsec
                        </button>
                      </div>
                    )}

                    {/* npub tab */}
                    {loginTab === "npub" && (
                      <div>
                        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>Enter your public key for read-only access.</p>
                        <input
                          type="text"
                          placeholder="npub1..."
                          value={keyInput}
                          onChange={e => setKeyInput(e.target.value)}
                          style={{ width: "100%", padding: "12px 14px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--surface-border)", color: "var(--text)", fontSize: 14, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
                        />
                        <button onClick={() => loginNpub(keyInput)} disabled={authLoading || !keyInput.trim()} style={{ width: "100%", padding: "14px 16px", borderRadius: 24, background: "var(--accent)", color: "#fff", fontSize: 15, fontWeight: 600, border: "none", cursor: authLoading || !keyInput.trim() ? "not-allowed" : "pointer", opacity: keyInput.trim() ? 1 : 0.5 }}>
                          Browse with npub
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}

      {/* ── Body ── */}
      <div className={isFeed ? "app-body" : "app-body-wide"}>{children}</div>
    </>
  );
}
