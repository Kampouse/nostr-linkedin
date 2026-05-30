/**
 * PostCard.tsx — Shared post card used in Feed and Profile Activity
 * LinkedIn-style: avatar + name + headline + time → content → action buttons
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Heart, MessageCircle, Repeat2, Share, Check, Send,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import RenderContent from "./RenderContent";
import {
  shortenPubkey, timeAgo, noteLink, npubFromHex,
  type UserProfile, type Event,
} from "../lib/nostr";

interface PostCardProps {
  post: Event;
  profile?: UserProfile;
  readOnly?: boolean;
}

export default function PostCard({ post, profile, readOnly: readOnlyProp }: PostCardProps) {
  const { readOnly: authReadOnly, signAndPublish } = useAuth();
  const readOnly = readOnlyProp ?? authReadOnly;

  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replySending, setReplySending] = useState(false);

  const name = profile?.display_name || profile?.name || shortenPubkey(post.pubkey);
  const pic = profile?.picture;
  const headline = profile?.about?.slice(0, 80) || "";
  const initial = name.slice(0, 1).toUpperCase();
  const navigate = useNavigate();

  const handleLike = async () => {
    if (readOnly || liked) return;
    try {
      await signAndPublish({
        kind: 7, content: "+",
        tags: [["e", post.id], ["p", post.pubkey]],
      });
      setLiked(true);
    } catch (e: any) { console.error("like:", e.message); }
  };

  const handleRepost = async () => {
    if (readOnly || reposted) return;
    try {
      await signAndPublish({
        kind: 6, content: "",
        tags: [["e", post.id], ["p", post.pubkey]],
      });
      setReposted(true);
    } catch (e: any) { console.error("repost:", e.message); }
  };

  const handleReply = async () => {
    if (readOnly || !replyText.trim()) return;
    setReplySending(true);
    try {
      await signAndPublish({
        kind: 1, content: replyText.trim(),
        tags: [["e", post.id], ["p", post.pubkey]],
      });
      setReplyText("");
      setReplyOpen(false);
    } catch (e: any) { console.error("reply:", e.message); }
    setReplySending(false);
  };

  const handleShare = async () => {
    const link = noteLink(post.id);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { window.open(link, "_blank"); }
  };

  return (
    <div className="card post-card">
      <div className="post-header">
        <Link
          to={`/in/${npubFromHex(post.pubkey)}`}
          className="post-avatar"
          style={{ background: pic ? '#262626' : 'linear-gradient(135deg, #10b981, #059669)', textDecoration: 'none' }}
        >
          {pic ? <img src={pic} alt="" /> : <span style={{ color: '#fff' }}>{initial}</span>}
        </Link>
        <div className="post-author-info">
          <Link to={`/in/${npubFromHex(post.pubkey)}`} className="post-author-name" style={{ textDecoration: 'none', color: 'inherit' }}>
            {name}
          </Link>
          {headline && <div className="post-author-headline">{headline}</div>}
          <div className="post-time">{timeAgo(post.created_at)} · 🌐</div>
        </div>
      </div>

      <div className="post-content" onClick={() => post.id && navigate(`/post/${post.id}`)} style={{ cursor: "pointer" }}><RenderContent text={post.content} /></div>

      {replyOpen && (
        <div className="reply-box">
          <textarea
            className="reply-textarea"
            placeholder="Write a reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => { setReplyOpen(false); setReplyText(""); }}>Cancel</button>
            <button className="btn-primary" style={{ fontSize: 13, padding: '4px 14px' }} disabled={replySending || !replyText.trim()} onClick={handleReply}>
              <Send size={14} /> {replySending ? "Sending…" : "Reply"}
            </button>
          </div>
        </div>
      )}

      <div className="post-actions">
        <button
          className={`post-action-btn${liked ? ' active' : ''}`}
          onClick={handleLike}
          style={readOnly ? { opacity: 0.4, cursor: 'default' } : undefined}
        >
          <span className="post-action-icon">{liked ? <Heart size={18} fill="#ef4444" color="#ef4444" /> : <Heart size={18} />}</span>
        </button>
        <button className="post-action-btn" onClick={() => setReplyOpen(!replyOpen)}>
          <span className="post-action-icon"><MessageCircle size={18} /></span>
        </button>
        <button
          className={`post-action-btn${reposted ? ' active' : ''}`}
          onClick={handleRepost}
          style={readOnly ? { opacity: 0.4, cursor: 'default' } : undefined}
        >
          <span className="post-action-icon">{reposted ? <Check size={18} /> : <Repeat2 size={18} />}</span>
        </button>
        <button className="post-action-btn" onClick={handleShare}>
          <span className="post-action-icon">{copied ? <Check size={18} /> : <Share size={18} />}</span>
        </button>
      </div>
    </div>
  );
}
