/**
 * PostDetailPage.tsx — Single post with replies AND reactions
 * Uses TanStack Query for instant cached data on remount
 */

import { useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import PostCard from "../components/PostCard";
import RenderContent from "../components/RenderContent";
import {
  pool, npubFromHex, fetchProfile, fetchProfiles,
  shortenPubkey, timeAgo,
  READ_RELAYS,
  type UserProfile, type Event,
} from "../lib/nostr";

export default function PostDetailPage({ postId: postIdProp }: { postId?: string }) {
  const { id: postIdParam } = useParams<{ id?: string }>();
  const postId = postIdProp || postIdParam;
  const { pubkey, readOnly, signAndPublish } = useAuth();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // Look up post from feed cache as instant placeholder
  const feedPlaceholder = useMemo(() => {
    if (!postId) return undefined;
    // Search ALL query caches for this post (feed, profile-activity, etc.)
    const caches = queryClient.getQueriesData<any>({ queryKey: ["feed"] });
    const profileCaches = queryClient.getQueriesData<any>({ queryKey: ["profile-activity"] });
    const allCaches = [...caches, ...profileCaches];
    for (const [, data] of allCaches) {
      const posts = data?.posts;
      if (!posts) continue;
      const post = posts.find((p: Event) => p.id === postId);
      if (!post) continue;
      return {
        post,
        authorProfile: data.profiles?.get(post.pubkey) ?? null,
        replies: [] as Event[],
        reactions: [] as Event[],
        profiles: data.profiles ?? new Map<string, UserProfile>(),
      };
    }
    return undefined;
  }, [postId, queryClient]);

  // Fetch post + author + replies + reactions — keyed by postId only (no pubkey = no double-fetch)
  const { data, isPending } = useQuery({
    queryKey: ["post", postId],
    queryFn: async () => {
      if (!postId) return null;

      const events = await pool.querySync(READ_RELAYS, { kinds: [1], ids: [postId], limit: 1 });
      if (events.length === 0) return null;
      const post = events[0];

      const authorProfile = await fetchProfile(post.pubkey);

      const [replyEvents, reactionEvents] = await Promise.all([
        pool.querySync(READ_RELAYS, { kinds: [1], "#e": [postId], limit: 100 }),
        pool.querySync(READ_RELAYS, { kinds: [7], "#e": [postId], limit: 100 }),
      ]);

      const actualReplies = replyEvents.filter(r => r.id !== postId).sort((a, b) => a.created_at - b.created_at);

      // Deduplicate reactions — keep latest per pubkey
      const latestReactions = new Map<string, Event>();
      for (const r of reactionEvents) {
        const existing = latestReactions.get(r.pubkey);
        if (!existing || r.created_at > existing.created_at) {
          latestReactions.set(r.pubkey, r);
        }
      }
      const dedupedReactions = [...latestReactions.values()].sort((a, b) => b.created_at - a.created_at);

      // Load all profiles
      const allPubs = [...new Set([
        ...actualReplies.map(r => r.pubkey),
        ...dedupedReactions.map(r => r.pubkey),
      ])];
      const profilesMap = new Map<string, UserProfile>();
      if (allPubs.length > 0) {
        const pMap = await fetchProfiles(allPubs);
        for (const [k, v] of pMap) profilesMap.set(k, v);
      }

      return { post, authorProfile, replies: actualReplies, reactions: dedupedReactions, profiles: profilesMap };
    },
    enabled: !!postId,
    placeholderData: feedPlaceholder ?? ((prev: any) => prev),
  });

  const post = data?.post ?? null;
  const authorProfile = data?.authorProfile ?? null;
  const replies = data?.replies ?? [];
  const reactions = data?.reactions ?? [];
  const profiles = data?.profiles ?? new Map<string, UserProfile>();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["post", postId] });
  };

  const handleReply = async () => {
    if (!replyText.trim() || !postId || readOnly) return;
    setSending(true);
    try {
      await signAndPublish({ kind: 1, content: replyText.trim(), tags: [["e", postId, "", "reply"]] });
      setReplyText("");
      invalidate();
    } catch (e: any) {
      console.error("reply error:", e.message);
    }
    setSending(false);
  };

  if (!post) {
    if (isPending) {
      return (
        <div style={{ maxWidth: 555, margin: "0 auto", width: "100%" }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <div className="shimmer" style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="shimmer" style={{ width: "40%", height: 14, borderRadius: 4, marginBottom: 8 }} />
                <div className="shimmer" style={{ width: "25%", height: 12, borderRadius: 4 }} />
              </div>
            </div>
            <div className="shimmer" style={{ width: "90%", height: 12, borderRadius: 4, marginBottom: 8 }} />
            <div className="shimmer" style={{ width: "75%", height: 12, borderRadius: 4 }} />
          </div>
        </div>
      );
    }
    return (
      <div style={{ maxWidth: 555, margin: "0 auto", width: "100%" }}>
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <p style={{ color: "var(--text-muted)" }}>Post not found</p>
        </div>
      </div>
    );
  }

  // Group reaction emojis
  const emojiGroups = new Map<string, { emoji: string; count: number; users: string[] }>();
  for (const r of reactions) {
    const emoji = r.content || "+";
    const existing = emojiGroups.get(emoji) || { emoji, count: 0, users: [] as string[] };
    existing.count++;
    existing.users.push(r.pubkey);
    emojiGroups.set(emoji, existing);
  }

  return (
    <div style={{ maxWidth: 555, margin: "0 auto", width: "100%" }}>
      <div className="card" style={{ padding: 0 }}>
        {/* Header */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--surface-border)", display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => window.history.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18, padding: 0 }}>←</button>
          <span style={{ fontWeight: 600, fontSize: 16 }}>Post</span>
        </div>

        {/* Main post — reuse PostCard for identical UI */}
        <PostCard post={post} profile={authorProfile ?? undefined} />

        {/* Who reacted — expandable list */}
        {reactions.length > 0 && (
          <div style={{ borderBottom: "1px solid var(--surface-border)" }}>
            <div style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
              Reacted
            </div>
            {reactions.slice(0, 20).map(r => {
              const rp = profiles.get(r.pubkey);
              const rName = rp?.display_name || rp?.name || shortenPubkey(r.pubkey);
              const rPic = rp?.picture;
              const emoji = r.content || "+";
              const displayEmoji = emoji === "+" ? "👍" : emoji === "-" ? "👎" : emoji;
              return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 20px" }}>
                  <Link to={`/in/${npubFromHex(r.pubkey)}`}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%",
                      background: rPic ? "#262626" : "linear-gradient(135deg, #10b981, #059669)",
                      overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {rPic ? <img src={rPic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
                        <span style={{ color: "#fff", fontWeight: 600, fontSize: 11 }}>{rName.slice(0, 1).toUpperCase()}</span>
                      )}
                    </div>
                  </Link>
                  <Link to={`/in/${npubFromHex(r.pubkey)}`} style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--text)", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rName}
                  </Link>
                  <span style={{ fontSize: 18 }}>{displayEmoji}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", minWidth: 50, textAlign: "right" }}>{timeAgo(r.created_at)}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Reply box */}
        {!readOnly && (
          <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--surface-border)", display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="text"
              placeholder="Write a reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 20,
                background: "var(--surface)", border: "1px solid var(--surface-border)",
                color: "var(--text)", fontSize: 14, outline: "none",
              }}
            />
            <button
              onClick={handleReply}
              disabled={!replyText.trim() || sending}
              style={{
                padding: "8px 16px", borderRadius: 20,
                background: replyText.trim() ? "var(--accent)" : "var(--surface)",
                border: "none", color: replyText.trim() ? "#fff" : "var(--text-muted)",
                cursor: replyText.trim() ? "pointer" : "default", fontSize: 14,
              }}
            >
              Reply
            </button>
          </div>
        )}

        {/* Replies */}
        {replies.length > 0 && (
          <div>
            <div style={{ padding: "10px 20px 0", fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </div>
            {replies.map(r => {
              const rp = profiles.get(r.pubkey);
              const name = rp?.display_name || rp?.name || shortenPubkey(r.pubkey);
              const pic = rp?.picture;
              return (
                <div key={r.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--surface-border)" }}>
                  <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                    <Link to={`/in/${npubFromHex(r.pubkey)}`}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: pic ? "#262626" : "linear-gradient(135deg, #10b981, #059669)",
                        overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {pic ? <img src={pic} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (
                          <span style={{ color: "#fff", fontWeight: 600, fontSize: 12 }}>{name.slice(0, 1).toUpperCase()}</span>
                        )}
                      </div>
                    </Link>
                    <div>
                      <Link to={`/in/${npubFromHex(r.pubkey)}`} style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", textDecoration: "none" }}>{name}</Link>
                      <span style={{ color: "var(--text-muted)", fontSize: 12, marginLeft: 8 }}>{timeAgo(r.created_at)}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.4, paddingLeft: 42 }}><RenderContent text={r.content} maxImageHeight={400} /></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
