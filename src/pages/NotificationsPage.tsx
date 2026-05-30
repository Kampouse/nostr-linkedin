/**
 * NotificationsPage.tsx — Rich notifications with parsed content
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Repeat2, AtSign, Zap, UserPlus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { nip19 } from "nostr-tools";
import {
  pool, npubFromHex, fetchProfiles, timeAgo, shortenPubkey,
  READ_RELAYS,
  type UserProfile, type Event,
} from "../lib/nostr";
import { useNavigate } from "react-router-dom";

interface Notif {
  id: string;
  type: "reaction" | "repost" | "mention" | "follow" | "zap";
  from: string;
  event: Event;
  noteId?: string;
  reactionEmoji?: string;
  createdAt: number;
}

/** Parse nostr:npub... mentions into clickable names using loaded profiles */
function parseContent(text: string, profiles: Map<string, UserProfile>): string {
  return text.replace(/nostr:(npub1[a-z0-9]+)/g, (match, npubStr) => {
    try {
      const decoded = nip19.decode(npubStr);
      if ((decoded as any).type === "npub") {
        const hex = decoded.data as unknown as string;
        const p = profiles.get(hex);
        return `@${p?.display_name || p?.name || shortenPubkey(hex)}`;
      }
    } catch {}
    return match;
  });
}

export default function NotificationsPage() {
  const { pubkey } = useAuth();
  const navigate = useNavigate();

  const { data = { notifs: [] as Notif[], profiles: new Map<string, UserProfile>() } } = useQuery({
    queryKey: ["notifications", pubkey],
    queryFn: async () => {
      if (!pubkey) return { notifs: [] as Notif[], profiles: new Map<string, UserProfile>() };

      const all: Notif[] = [];

      const [reactions, reposts, mentions, follows] = await Promise.all([
        pool.querySync(READ_RELAYS, { kinds: [7], "#p": [pubkey], limit: 50 }),
        pool.querySync(READ_RELAYS, { kinds: [6], "#p": [pubkey], limit: 30 }),
        pool.querySync(READ_RELAYS, { kinds: [1], "#p": [pubkey], limit: 30 }),
        pool.querySync(READ_RELAYS, { kinds: [3], "#p": [pubkey], limit: 20 }),
      ]);

      for (const ev of reactions) {
        if (ev.pubkey === pubkey) continue;
        all.push({
          id: ev.id, type: "reaction", from: ev.pubkey, event: ev,
          noteId: ev.tags.find(t => t[0] === "e")?.[1],
          reactionEmoji: ev.content || "+",
          createdAt: ev.created_at,
        });
      }
      for (const ev of reposts) {
        if (ev.pubkey === pubkey) continue;
        all.push({ id: ev.id, type: "repost", from: ev.pubkey, event: ev, noteId: ev.tags.find(t => t[0] === "e")?.[1], createdAt: ev.created_at });
      }
      for (const ev of mentions) {
        if (ev.pubkey === pubkey) continue;
        if (ev.tags.some(t => t[0] === "e" && t[3] === "mention")) continue;
        all.push({ id: ev.id, type: "mention", from: ev.pubkey, event: ev, noteId: ev.id, createdAt: ev.created_at });
      }
      for (const ev of follows) {
        if (ev.pubkey === pubkey) continue;
        if (ev.tags.some(t => t[0] === "p" && t[1] === pubkey)) {
          all.push({ id: ev.id + "-follow", type: "follow", from: ev.pubkey, event: ev, createdAt: ev.created_at });
        }
      }

      all.sort((a, b) => b.createdAt - a.createdAt);

      const pubkeys = [...new Set(all.map(n => n.from))];
      for (const n of all) {
        if (n.type === "mention") {
          const matches = n.event.content.matchAll(/nostr:(npub1[a-z0-9]+)/g);
          for (const m of matches) {
            try {
              const decoded = nip19.decode(m[1]);
              if (decoded.type === "npub") pubkeys.push(decoded.data as string);
            } catch {}
          }
        }
      }
      const unique = [...new Set(pubkeys)];
      const profiles = new Map<string, UserProfile>();
      if (unique.length > 0) {
        const pMap = await fetchProfiles(unique);
        for (const [k, v] of pMap) profiles.set(k, v);
      }

      return { notifs: all, profiles };
    },
    enabled: !!pubkey,
    placeholderData: (prev: any) => prev,
  });

  const notifs = data.notifs;
  const profiles = data.profiles;

  return (
    <div style={{ maxWidth: 555, margin: "0 auto", width: "100%" }}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--surface-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Notifications
          </h2>
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{notifs.length}</span>
        </div>

        {notifs.length === 0 ? (
          <div className="empty-state" style={{ padding: 48 }}>
            <AtSign size={48} strokeWidth={1} color="var(--text-muted)" />
            <p style={{ fontSize: 16, fontWeight: 600 }}>No notifications yet</p>
            <p>{pubkey ? "When someone reacts, reposts, or mentions you, it'll show here." : "Sign in to see reactions, reposts, and mentions."}</p>
          </div>
        ) : (
          notifs.map((n) => {
            const p = profiles.get(n.from);
            const name = p?.display_name || p?.name || shortenPubkey(n.from);
            const pic = p?.picture;

            // Build notification text
            let action = "";
            let preview = "";
            let Icon: typeof Heart;
            let iconColor = "#ef4444";

            switch (n.type) {
              case "reaction":
                Icon = Heart;
                iconColor = "#ef4444";
                action = `reacted ${n.reactionEmoji && n.reactionEmoji !== "+" ? n.reactionEmoji + " " : ""}to your post`;
                break;
              case "repost":
                Icon = Repeat2;
                iconColor = "#10b981";
                action = "reposted your note";
                break;
              case "mention":
                Icon = AtSign;
                iconColor = "#3b82f6";
                action = "mentioned you in a post";
                preview = parseContent(n.event.content, profiles).slice(0, 140);
                break;
              case "follow":
                Icon = UserPlus;
                iconColor = "#a855f7";
                action = "started following you";
                break;
              default:
                Icon = Zap;
                iconColor = "#f59e0b";
                action = "zapped you";
            }

            return (
              <div
                key={n.id}
                onClick={() => {
                  if (n.type === "follow") {
                    navigate(`/in/${npubFromHex(n.from)}`);
                  } else {
                    const targetId = n.noteId || n.event.id;
                    if (targetId) navigate(`/post/${targetId}`);
                  }
                }}
                style={{
                  display: "flex", gap: 12, padding: "14px 20px",
                  borderBottom: "1px solid var(--surface-border)",
                  alignItems: "flex-start",
                  cursor: "pointer", transition: "background 0.15s",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--surface)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Avatar + type icon */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Link to={`/in/${npubFromHex(n.from)}`} onClick={e => e.stopPropagation()}>
                    <div style={{
                      width: 44, height: 44, borderRadius: "50%",
                      background: pic ? "#262626" : "linear-gradient(135deg, #10b981, #059669)",
                      overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {pic ? <img src={pic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
                        <span style={{ color: "#fff", fontWeight: 600 }}>{name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                  </Link>
                  <div style={{
                    position: "absolute", bottom: -2, right: -2,
                    width: 20, height: 20, borderRadius: "50%",
                    background: iconColor, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon size={12} color="#fff" />
                  </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, lineHeight: 1.4 }}>
                    <Link to={`/in/${npubFromHex(n.from)}`} onClick={e => e.stopPropagation()} style={{ color: "var(--text)", fontWeight: 600, textDecoration: "none" }}>
                      {name}
                    </Link>
                    {" "}{action}
                  </div>
                  {preview && (
                    <div style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 6, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {preview}
                    </div>
                  )}
                  <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
                    {timeAgo(n.createdAt)}
                  </div>
                </div>

                {/* Reaction emoji shown on the right */}
                {n.type === "reaction" && n.reactionEmoji && n.reactionEmoji !== "+" && (
                  <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1 }}>{n.reactionEmoji}</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
