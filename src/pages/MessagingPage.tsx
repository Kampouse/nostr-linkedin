/**
 * MessagingPage.tsx — NIP-04 private direct messages
 * 
 * Uses kind 4 events with NIP-04 encryption.
 * Falls back gracefully for NIP-07/NIP-46 (can decrypt via extension/signer).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Send, MessageCircle, Search } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import {
  pool, npubFromHex, hexFromNpub, fetchProfile, fetchProfiles,
  shortenPubkey, publishEvent, timeAgo,
  READ_RELAYS, WRITE_RELAYS, NIP46_RELAYS,
  type UserProfile, type Event,
} from "../lib/nostr";
import * as nip04 from "nostr-tools/nip04";

interface DM {
  event: Event;
  peer: string;
  plaintext: string;
  createdAt: number;
}

interface Conversation {
  peer: string;
  profile: UserProfile;
  lastMessage: string;
  lastTime: number;
  unread: number;
  messages: DM[];
}

export default function MessagingPage() {
  const { pubkey, secretKey, signer, signAndPublish } = useAuth();
  const [searchParams] = useSearchParams();
  const dmTarget = searchParams.get("dm");
  const [conversations, setConversations] = useState<Map<string, DM[]>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [activePeer, setActivePeer] = useState<string | null>(dmTarget);
  const [compose, setCompose] = useState("");
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Decrypt a NIP-04 DM
  const decryptDm = useCallback(async (event: Event): Promise<string> => {
    const peer = event.pubkey === pubkey ? event.tags.find(t => t[0] === "p")?.[1]! : event.pubkey;
    if (secretKey) {
      return nip04.decrypt(secretKey, peer, event.content);
    }
    // NIP-46 signer
    if (signer) {
      return signer.nip04Decrypt(peer, event.content);
    }
    // NIP-07 extension
    if (typeof window !== "undefined" && (window as any).nostr?.nip04?.decrypt) {
      return (window as any).nostr.nip04.decrypt(peer, event.content);
    }
    return "[Encrypted — login to decrypt]";
  }, [pubkey, secretKey, signer]);

  // Load DMs
  const loadMessages = useCallback(async () => {
    if (!pubkey) return;

    // Fetch kind 4 DMs sent to us and by us
    const [received, sent] = await Promise.all([
      pool.querySync(READ_RELAYS, { kinds: [4], "#p": [pubkey], limit: 100 }),
      pool.querySync(READ_RELAYS, { kinds: [4], authors: [pubkey], limit: 100 }),
    ]);

    const all = [...received, ...sent].sort((a, b) => b.created_at - a.created_at);

    // Group by peer
    const grouped = new Map<string, DM[]>();
    for (const ev of all) {
      const peer = ev.pubkey === pubkey ? ev.tags.find(t => t[0] === "p")?.[1] : ev.pubkey;
      if (!peer) continue;

      let plaintext = "";
      try {
        plaintext = await decryptDm(ev);
      } catch {
        plaintext = "[Could not decrypt]";
      }

      const dm: DM = { event: ev, peer, plaintext, createdAt: ev.created_at };
      const existing = grouped.get(peer) || [];
      existing.push(dm);
      grouped.set(peer, existing);
    }

    setConversations(grouped);

    // Load profiles for all peers
    const peers = [...grouped.keys()];
    if (peers.length > 0) {
      const pMap = await fetchProfiles(peers);
      setProfiles(pMap);
    }
  }, [pubkey, decryptDm]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Ensure DM target peer exists in conversations and profile loaded
  useEffect(() => {
    if (!dmTarget) return;
    setConversations(prev => {
      if (prev.has(dmTarget)) return prev;
      const next = new Map(prev);
      next.set(dmTarget, []);
      return next;
    });
    fetchProfiles([dmTarget]).then(pMap => {
      setProfiles(prev => new Map([...prev, ...pMap]));
    });
  }, [dmTarget]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversations, activePeer]);

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
      } else if (signer) {
        ciphertext = await signer.nip04Encrypt(activePeer, text);
      } else if (typeof window !== "undefined" && (window as any).nostr?.nip04?.encrypt) {
        ciphertext = await (window as any).nostr.nip04.encrypt(activePeer, text);
      } else {
        throw new Error("No encryption available — login to send DMs");
      }

      // Publish the DM
      await signAndPublish({ kind: 4, content: ciphertext, tags: [["p", activePeer]] });
      await loadMessages(); // refresh
    } catch (e: any) {
      console.error("send error:", e.message);
      alert("Failed to send: " + e.message);
      setCompose(text); // restore on failure
    }
    setSending(false);
  }, [activePeer, compose, secretKey, signAndPublish, loadMessages]);

  const peers = [...conversations.keys()].sort((a, b) => {
    const aLast = conversations.get(a)?.[0]?.createdAt || 0;
    const bLast = conversations.get(b)?.[0]?.createdAt || 0;
    return bLast - aLast;
  });

  const filteredPeers = searchQuery
    ? peers.filter(pk => {
        const p = profiles.get(pk);
        const name = p?.display_name || p?.name || "";
        return name.toLowerCase().includes(searchQuery.toLowerCase()) || pk.includes(searchQuery);
      })
    : peers;

  const activeMessages = activePeer ? (conversations.get(activePeer) || []) : [];

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

          {filteredPeers.length === 0 ? (
            <div className="empty-state" style={{ padding: 48 }}>
              <MessageCircle size={48} strokeWidth={1} color="var(--text-muted)" />
              <p style={{ fontSize: 16, fontWeight: 600 }}>No messages yet</p>
              <p>{pubkey ? "Start a conversation by sending a DM to any Nostr profile." : "Sign in to send and receive private messages."}</p>
            </div>
          ) : (
            <div style={{ overflowY: "auto", flex: 1 }}>
              {filteredPeers.map(pk => {
                const p = profiles.get(pk);
                const name = p?.display_name || p?.name || shortenPubkey(pk);
                const pic = p?.picture;
                const msgs = conversations.get(pk) || [];
                const lastMsg = msgs[0];
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
                  const p = profiles.get(activePeer);
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
            {[...activeMessages].reverse().map(dm => {
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
            })}
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
