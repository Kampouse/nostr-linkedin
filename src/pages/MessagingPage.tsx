/**
 * MessagingPage.tsx — NIP-04 private direct messages
 * 
 * Uses kind 4 events with NIP-04 encryption.
 * Falls back gracefully for NIP-07/NIP-46 (can decrypt via extension/signer).
 */

import { useState, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Send, MessageCircle, Search, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import {
  pool, npubFromHex, fetchProfiles,
  shortenPubkey, publishEvent, timeAgo,
  READ_RELAYS,
  type UserProfile, type Event,
} from "../lib/nostr";
import * as nip04 from "nostr-tools/nip04";

interface DM {
  event: Event;
  peer: string;
  plaintext: string;
  createdAt: number;
}

export default function MessagingPage() {
  const { pubkey, secretKey, signer, signAndPublish } = useAuth();
  const [searchParams] = useSearchParams();
  const dmTarget = searchParams.get("dm");
  const [activePeer, setActivePeer] = useState<string | null>(dmTarget);
  const [compose, setCompose] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Decrypt a NIP-04 DM
  const decryptDm = useCallback(async (event: Event): Promise<string> => {
    const peer = event.pubkey === pubkey ? event.tags.find(t => t[0] === "p")?.[1]! : event.pubkey;
    if (secretKey) {
      return nip04.decrypt(secretKey, peer, event.content);
    }
    // NIP-07 extension
    if (typeof window !== "undefined" && (window as any).nostr?.nip04?.decrypt) {
      return (window as any).nostr.nip04.decrypt(peer, event.content);
    }
    // NIP-46 signer
    if (signer) {
      return signer.nip04Decrypt(peer, event.content);
    }
    return "[Encrypted — login to decrypt]";
  }, [pubkey, secretKey, signer]);

  // Load and decrypt DMs via TanStack Query
  const { data: convData, isPending } = useQuery({
    queryKey: ["dms", pubkey],
    queryFn: async () => {
      if (!pubkey) return { conversations: new Map<string, DM[]>(), profiles: new Map<string, UserProfile>() };

      // Fetch kind 4 DMs sent to us and by us in parallel
      const [received, sent] = await Promise.all([
        pool.querySync(READ_RELAYS, { kinds: [4], "#p": [pubkey], limit: 100 }),
        pool.querySync(READ_RELAYS, { kinds: [4], authors: [pubkey], limit: 100 }),
      ]);

      const all = [...received, ...sent].sort((a, b) => b.created_at - a.created_at);

      // Decrypt in parallel batches of 10 to avoid blocking
      const grouped = new Map<string, DM[]>();
      const decryptBatch = async (events: Event[]) => {
        const results = await Promise.allSettled(
          events.map(async ev => {
            const peer = ev.pubkey === pubkey ? ev.tags.find(t => t[0] === "p")?.[1] : ev.pubkey;
            if (!peer) return null;
            let plaintext = "";
            try {
              plaintext = await decryptDm(ev);
            } catch {
              plaintext = "[Could not decrypt]";
            }
            return { event: ev, peer, plaintext, createdAt: ev.created_at } as DM;
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            const dm = r.value;
            const existing = grouped.get(dm.peer) || [];
            existing.push(dm);
            grouped.set(dm.peer, existing);
          }
        }
      };

      // Process in batches of 10
      for (let i = 0; i < all.length; i += 10) {
        await decryptBatch(all.slice(i, i + 10));
      }

      // Sort each conversation by time
      for (const [peer, msgs] of grouped) {
        msgs.sort((a, b) => a.createdAt - b.createdAt);
        grouped.set(peer, msgs);
      }

      // Load profiles for all peers
      const peers = [...grouped.keys()];
      const profilesMap = new Map<string, UserProfile>();
      if (peers.length > 0) {
        const pMap = await fetchProfiles(peers);
        for (const [k, v] of pMap) profilesMap.set(k, v);
      }

      return { conversations: grouped, profiles: profilesMap };
    },
    enabled: !!pubkey,
    placeholderData: (prev: any) => prev,
    staleTime: 30_000,
  });

  const conversations = convData?.conversations ?? new Map<string, DM[]>();
  const profiles = convData?.profiles ?? new Map<string, UserProfile>();

  // Ensure DM target peer exists
  const effectiveConversations = (() => {
    if (!dmTarget || conversations.has(dmTarget)) return conversations;
    const next = new Map(conversations);
    next.set(dmTarget, []);
    return next;
  })();

  // Load DM target profile if needed
  const effectiveProfiles = profiles;
  if (dmTarget && !profiles.has(dmTarget)) {
    fetchProfiles([dmTarget]).then(pMap => {
      queryClient.setQueryData(["dms", pubkey], (old: any) => {
        if (!old) return old;
        const merged = new Map([...old.profiles, ...pMap]);
        return { ...old, profiles: merged };
      });
    });
  }

  // Send a DM
  const sendMessage = useCallback(async () => {
    if (!activePeer || !compose.trim()) return;
    setSending(true);
    const text = compose.trim();
    setCompose("");
    try {
      let ciphertext: string;
      if (secretKey) {
        ciphertext = await nip04.encrypt(secretKey, activePeer, text);
      } else if (typeof window !== "undefined" && (window as any).nostr?.nip04?.encrypt) {
        ciphertext = await (window as any).nostr.nip04.encrypt(activePeer, text);
      } else if (signer) {
        ciphertext = await signer.nip04Encrypt(activePeer, text);
      } else {
        throw new Error("No encryption available — login to send DMs");
      }

      await signAndPublish({ kind: 4, content: ciphertext, tags: [["p", activePeer]] });
      queryClient.invalidateQueries({ queryKey: ["dms", pubkey] });
    } catch (e: any) {
      console.error("send error:", e.message);
      alert("Failed to send: " + e.message);
      setCompose(text);
    }
    setSending(false);
  }, [activePeer, compose, secretKey, signer, signAndPublish, pubkey, queryClient]);

  const peers = [...effectiveConversations.keys()].sort((a, b) => {
    const aMsgs = effectiveConversations.get(a) || [];
    const bMsgs = effectiveConversations.get(b) || [];
    const aLast = aMsgs[aMsgs.length - 1]?.createdAt || 0;
    const bLast = bMsgs[bMsgs.length - 1]?.createdAt || 0;
    return bLast - aLast;
  });

  const filteredPeers = searchQuery
    ? peers.filter(pk => {
        const p = effectiveProfiles.get(pk);
        const name = p?.display_name || p?.name || "";
        return name.toLowerCase().includes(searchQuery.toLowerCase()) || pk.includes(searchQuery);
      })
    : peers;

  const activeMessages = activePeer ? (effectiveConversations.get(activePeer) || []) : [];

  return (
    <div style={{ maxWidth: 555, margin: "0 auto", width: "100%", height: "calc(100vh - 120px)", display: "flex", flexDirection: "column" }}>
      {!activePeer ? (
        /* ── Conversation list ── */
        <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--surface-border)" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <MessageCircle size={20} /> Messaging
            </h2>
            <div style={{ position: "relative", marginTop: 12 }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px 8px 36px",
                  background: "var(--surface)", border: "1px solid var(--surface-border)",
                  borderRadius: 8, color: "var(--text)", fontSize: 14, outline: "none",
                }}
              />
            </div>
          </div>

          {isPending && effectiveConversations.size === 0 ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-muted)" }}>
              <Loader2 size={20} className="spin" /> Decrypting messages…
            </div>
          ) : filteredPeers.length === 0 ? (
            <div className="empty-state" style={{ padding: 48 }}>
              <MessageCircle size={48} strokeWidth={1} color="var(--text-muted)" />
              <p style={{ fontSize: 16, fontWeight: 600 }}>No messages yet</p>
              <p>{pubkey ? "Start a conversation by sending a DM to any Nostr profile." : "Sign in to send and receive private messages."}</p>
            </div>
          ) : (
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredPeers.map(pk => {
                const p = effectiveProfiles.get(pk);
                const name = p?.display_name || p?.name || shortenPubkey(pk);
                const pic = p?.picture;
                const msgs = effectiveConversations.get(pk) || [];
                const lastMsg = msgs[msgs.length - 1];
                const preview = lastMsg?.plaintext.slice(0, 60) || "";

                return (
                  <div
                    key={pk}
                    onClick={() => setActivePeer(pk)}
                    style={{
                      display: "flex", gap: 12, padding: "12px 20px",
                      borderBottom: "1px solid var(--surface-border)",
                      cursor: "pointer", transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{
                      width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                      background: pic ? "#262626" : "linear-gradient(135deg, #10b981, #059669)",
                      overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {pic ? <img src={pic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
                        <span style={{ color: "#fff", fontWeight: 600 }}>{name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{name}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{lastMsg ? timeAgo(lastMsg.createdAt) : ""}</span>
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {preview}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Chat view ── */
        <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          {/* Header */}
          <div style={{
            padding: "12px 20px", borderBottom: "1px solid var(--surface-border)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <button
              onClick={() => setActivePeer(null)}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, padding: "4px 8px" }}
            >
              ←
            </button>
            <Link to={`/in/${npubFromHex(activePeer)}`} style={{ textDecoration: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {(() => {
                  const p = effectiveProfiles.get(activePeer);
                  const name = p?.display_name || p?.name || shortenPubkey(activePeer);
                  const pic = p?.picture;
                  return (
                    <>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: pic ? "#262626" : "linear-gradient(135deg, #10b981, #059669)",
                        overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {pic ? <img src={pic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
                          <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{name}</span>
                    </>
                  );
                })()}
              </div>
            </Link>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {isPending && activeMessages.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "var(--text-muted)" }}>
                <Loader2 size={20} className="spin" /> Decrypting…
              </div>
            ) : (
              [...activeMessages].map(dm => {
                const isMine = dm.event.pubkey === pubkey;
                return (
                  <div key={dm.event.id} style={{
                    maxWidth: "75%", alignSelf: isMine ? "flex-end" : "flex-start",
                    padding: "10px 14px", borderRadius: 16,
                    background: isMine ? "var(--accent)" : "var(--surface)",
                    color: isMine ? "#fff" : "var(--text)",
                    fontSize: 14, lineHeight: 1.4,
                  }}>
                    {dm.plaintext}
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, textAlign: "right" }}>
                      {timeAgo(dm.createdAt)}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Compose bar */}
          <div style={{
            padding: "12px 16px", borderTop: "1px solid var(--surface-border)",
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <input
              type="text"
              placeholder="Type a message..."
              value={compose}
              onChange={e => setCompose(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 20,
                background: "var(--surface)", border: "1px solid var(--surface-border)",
                color: "var(--text)", fontSize: 14, outline: "none",
              }}
            />
            <button
              onClick={sendMessage}
              disabled={!compose.trim() || sending}
              style={{
                width: 40, height: 40, borderRadius: "50%",
                background: compose.trim() ? "var(--accent)" : "var(--surface)",
                border: "none", cursor: compose.trim() ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "background 0.15s",
              }}
            >
              <Send size={18} color={compose.trim() ? "#fff" : "var(--text-muted)"} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
