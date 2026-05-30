/**
 * useAuth.tsx — Auth context supporting NIP-46, NIP-07, nsec, and npub login
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { hexToBytes } from "@noble/hashes/utils";
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  nip19,
} from "nostr-tools";
import {
  startNdkConnect,
  NdkNostrSigner,
  type NdkConnectHandle,
} from "../lib/ndk-signer";
import {
  NIP46_RELAYS,
  fetchProfile,
  publishEvent,
  type UserProfile,
} from "../lib/nostr";

const STORAGE_KEY = "nostr-linkedin:session";

export interface AuthState {
  signer: NdkNostrSigner | null;
  pubkey: string;
  profile: UserProfile | null;
  loading: boolean;
  error: string;
  readOnly: boolean;
  // NIP-46 flow
  connectUri: string;
  connectHandle: NdkConnectHandle | null;
  startConnect: () => void;
  cancelConnect: () => void;
  // Alt logins
  loginNip07: () => Promise<void>;
  loginNsec: (nsec: string) => void;
  loginNpub: (npub: string) => void;
  // Shared
  disconnect: () => void;
  refreshProfile: () => Promise<void>;
  checkSession: () => Promise<boolean>;
  signAndPublish: (template: { kind: number; content: string; tags?: string[][] }) => Promise<void>;
  signEvent: (template: { kind: number; content: string; tags: string[][] }) => Promise<any>;
  secretKey: Uint8Array | null;
  sessionAlive: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signer, setSigner] = useState<NdkNostrSigner | null>(null);
  const [pubkey, setPubkey] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connectUri, setConnectUri] = useState("");
  const [connectHandle, setConnectHandle] = useState<NdkConnectHandle | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  // For nsec mode: store secret key in memory
  const [secretKey, setSecretKey] = useState<Uint8Array | null>(null);
  const [sessionAlive, setSessionAlive] = useState(true); // optimistic

  const refreshProfile = useCallback(async () => {
    if (!pubkey) return;
    const p = await fetchProfile(pubkey);
    setProfile(p);
  }, [pubkey]);

  useEffect(() => {
    if (pubkey) refreshProfile();
  }, [pubkey, refreshProfile]);

  // ── Restore session ──
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (parsed.mode === "npub" && parsed.pubkey) {
        setPubkey(parsed.pubkey);
        setReadOnly(true);
        return;
      }
      if (parsed.nsecHex) {
        const sk = hexToBytes(parsed.nsecHex);
        setSecretKey(sk);
        setPubkey(getPublicKey(sk));
        return;
      }
      if (parsed.clientSecKey && parsed.bunkerPubkey) {
        const s = new NdkNostrSigner({
          clientSecretKey: hexToBytes(parsed.clientSecKey),
          bunkerPubkey: parsed.bunkerPubkey,
          relays: parsed.relays || NIP46_RELAYS,
          userPubkey: parsed.userPubkey,
        });
        setSigner(s);
        setPubkey(parsed.userPubkey || parsed.bunkerPubkey);
      }
    } catch (e: any) {
      console.warn("[auth] restore failed:", e.message);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // ── Session health check (ping bunker on restore + every 2 min) ──
  useEffect(() => {
    if (!signer || secretKey) return; // only for NIP-46 sessions
    let cancelled = false;
    // Mark session as verifying while we ping
    setSessionAlive(false);
    const check = async () => {
      if (cancelled) return;
      try {
        const alive = await signer.ping();
        if (cancelled) return;
        if (!alive) {
          console.warn("[auth] session health check failed, disconnecting");
          disconnect();
        } else {
          setSessionAlive(true);
        }
      } catch {
        if (!cancelled) disconnect();
      }
    };
    // Ping after 3s (let WebSocket connect), then every 2 min
    const initial = setTimeout(check, 3_000);
    const interval = setInterval(check, 120_000);
    return () => { cancelled = true; clearTimeout(initial); clearInterval(interval); };
  }, [signer, secretKey]);

  // ── Sign + publish helper ──
  const signAndPublish = useCallback(async (template: { kind: number; content: string; tags?: string[][] }) => {
    if (secretKey) {
      const evt = finalizeEvent(
        { kind: template.kind, content: template.content, tags: template.tags || [], created_at: Math.floor(Date.now() / 1000) },
        secretKey,
      );
      await publishEvent(evt);
      return;
    }
    if (signer) {
      const evt = await signer.signEvent({
        kind: template.kind,
        content: template.content,
        tags: template.tags || [],
        created_at: Math.floor(Date.now() / 1000),
      });
      await publishEvent(evt);
      return;
    }
    throw new Error("No signer available");
  }, [signer, secretKey]);

  // ── Raw sign helper (no publish) ──
  const signEventRaw = useCallback(async (template: { kind: number; content: string; tags: string[][] }) => {
    if (secretKey) {
      return finalizeEvent(
        { kind: template.kind, content: template.content, tags: template.tags, created_at: Math.floor(Date.now() / 1000) },
        secretKey,
      );
    }
    if (signer) {
      return signer.signEvent({
        kind: template.kind,
        content: template.content,
        tags: template.tags,
        created_at: Math.floor(Date.now() / 1000),
      });
    }
    throw new Error("No signer available");
  }, [signer, secretKey]);

  // ── NIP-46 pairing ──
  const startConnect = useCallback(() => {
    setError("");
    setLoading(true);

    let handle: NdkConnectHandle;
    try {
      handle = startNdkConnect({
        relays: NIP46_RELAYS,
        perms:
          "get_public_key,nip04_encrypt,nip04_decrypt,nip44_encrypt,nip44_decrypt,sign_event:0,sign_event:1,sign_event:3,sign_event:4,sign_event:30023,sign_event:30402",
        metadata: {
          name: "NostrLink",
          url: "https://github.com/Kampouse/nip46-connect-demo",
        },
      });
    } catch (e: any) {
      setError("Init failed: " + e.message);
      setLoading(false);
      return;
    }

    setConnectHandle(handle);
    setConnectUri(handle.uri);

    handle.ready
      .then(async (s) => {
        let userPk: string | null = null;
        try {
          userPk = await s.getPublicKey();
        } catch {
          userPk = (s as any)._userPubkey || null;
        }

        if (!userPk) {
          setError("Bunker did not return a public key.");
          setLoading(false);
          return;
        }

        const serialized = s.serialize();
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            mode: "nip46",
            clientSecKey: serialized.clientSecretKey,
            bunkerPubkey: serialized.bunkerPubkey,
            relays: serialized.relays,
            userPubkey: serialized.userPubkey,
          })
        );

        setSigner(s);
        setPubkey(userPk);
        setConnectUri("");
        setConnectHandle(null);
        setLoading(false);
      })
      .catch((e: any) => {
        setError(e.message || "Pairing failed");
        setConnectUri("");
        setConnectHandle(null);
        setLoading(false);
      });
  }, []);

  const cancelConnect = useCallback(() => {
    connectHandle?.cancel();
    setConnectHandle(null);
    setConnectUri("");
    setLoading(false);
  }, [connectHandle]);

  // ── NIP-07 (browser extension) ──
  const loginNip07 = useCallback(async () => {
    const win = window as any;
    if (!win.nostr) {
      setError("No NIP-07 extension found. Install Alby, nos2x, or another Nostr extension.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const pk = await win.nostr.getPublicKey();
      if (!pk) throw new Error("Extension denied access");
      // Store a fake "nip07" session so we know to use extension
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: "nip07", pubkey: pk }));
      setPubkey(pk);
      setReadOnly(false);
    } catch (e: any) {
      setError(e.message || "NIP-07 login failed");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── nsec ──
  const loginNsec = useCallback((nsecOrHex: string) => {
    setError("");
    setLoading(true);
    try {
      let sk: Uint8Array;
      if (nsecOrHex.startsWith("nsec")) {
        const decoded = nip19.decode(nsecOrHex);
        if (decoded.type !== "nsec") throw new Error("Invalid nsec");
        sk = decoded.data as Uint8Array;
      } else {
        sk = hexToBytes(nsecOrHex);
      }
      const pk = getPublicKey(sk);
      const hexSk = Array.from(sk).map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: "nsec", nsecHex: hexSk }));
      setSecretKey(sk);
      setPubkey(pk);
    } catch (e: any) {
      setError(e.message || "Invalid key");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── npub (read-only) ──
  const loginNpub = useCallback((npubOrHex: string) => {
    setError("");
    setLoading(true);
    try {
      let pk: string;
      if (npubOrHex.startsWith("npub")) {
        const decoded = nip19.decode(npubOrHex);
        if (decoded.type !== "npub") throw new Error("Invalid npub");
        pk = decoded.data as string;
      } else {
        pk = npubOrHex;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: "npub", pubkey: pk }));
      setPubkey(pk);
      setReadOnly(true);
    } catch (e: any) {
      setError(e.message || "Invalid key");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Disconnect ──
  const disconnect = useCallback(() => {
    try { signer?.close(); } catch { /* already dead */ }
    setSigner(null);
    setPubkey("");
    setProfile(null);
    setError("");
    setReadOnly(false);
    setSecretKey(null);
    setSessionAlive(true);
    localStorage.removeItem(STORAGE_KEY);
  }, [signer]);

  const checkSession = useCallback(async (): Promise<boolean> => {
    if (secretKey) return true;   // nsec: always valid
    if (!signer) return false;    // no signer = no session
    const alive = await signer.ping();
    if (!alive) {
      console.warn("[auth] NIP-46 session dead, disconnecting");
      disconnect();
    }
    return alive;
  }, [signer, secretKey, disconnect]);

  // For NIP-07, override signAndPublish to use the extension
  const signAndPublishWrapped = useCallback(async (template: { kind: number; content: string; tags?: string[][] }) => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    if (parsed?.mode === "nip07") {
      const win = window as any;
      const evt = await win.nostr.signEvent({
        kind: template.kind,
        content: template.content,
        tags: template.tags || [],
        created_at: Math.floor(Date.now() / 1000),
      });
      await publishEvent(evt);
      return;
    }
    return signAndPublish(template);
  }, [signAndPublish]);

  return (
    <AuthContext.Provider
      value={{
        signer,
        pubkey,
        profile,
        loading,
        error,
        readOnly,
        connectUri,
        connectHandle,
        startConnect,
        cancelConnect,
        loginNip07,
        loginNsec,
        loginNpub,
        disconnect,
        refreshProfile,
        checkSession,
        signAndPublish: signAndPublishWrapped,
        signEvent: signEventRaw,
        secretKey,
        sessionAlive,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
