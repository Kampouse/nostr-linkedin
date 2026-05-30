/**
 * FeedPage.tsx — LinkedIn Home feed (3-column with sidebars)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { Image, SmilePlus, Globe, Hash, Loader2, Zap, Key, Eye, EyeOff, Plug, UserCircle, Copy, CheckCircle, XCircle, TrendingUp, Clock, Heart, Zap as ZapIcon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import {
  fetchFeed, fetchProfiles, npubFromHex, uploadToNostrBuild,
  shortenPubkey, timeAgo,
  type UserProfile, type Event,
} from "../lib/nostr";
import PostCard from "../components/PostCard";

type LoginTab = "signer" | "extension" | "nsec" | "npub";

export default function FeedPage() {
  const { pubkey, profile, readOnly, signEvent, signAndPublish, connectUri, startConnect, cancelConnect, loginNip07, loginNsec, loginNpub, loading: authLoading, error: authError } = useAuth();
  const queryClient = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [compose, setCompose] = useState("");
  const [posting, setPosting] = useState(false);
  const [showImgInput, setShowImgInput] = useState(false);
  const [imgUrl, setImgUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showTopics, setShowTopics] = useState(false);
  const [feedSort, setFeedSort] = useState<"trending" | "latest" | "popular" | "mostzapped">("trending");

  const sortOptions = [
    { key: "trending" as const, label: "Trending", icon: TrendingUp },
    { key: "latest" as const, label: "Latest", icon: Clock },
    { key: "popular" as const, label: "Popular", icon: Heart },
    { key: "mostzapped" as const, label: "Most Zapped", icon: ZapIcon },
  ];

  // Login state
  const [loginTab, setLoginTab] = useState<LoginTab>("signer");
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [nip07Available] = useState(() => !!(window as any).nostr);

  const isLoggedIn = !!pubkey;

  // TanStack Infinite Query — feed with "load more" pagination
  const {
    data: feedData,
    isPending,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["feed", feedSort],
    queryFn: async ({ pageParam }: { pageParam?: number }) => {
      const events = await fetchFeed(feedSort, pageParam);
      const pubkeys = [...new Set(events.map((e: Event) => e.pubkey))];
      const allProfiles = new Map<string, UserProfile>();
      for (let i = 0; i < pubkeys.length; i += 50) {
        const chunk = pubkeys.slice(i, i + 50);
        const pMap = await fetchProfiles(chunk);
        for (const [k, v] of pMap) allProfiles.set(k, v);
      }
      // Filter out posts from authors with no real profile (bots/spam)
      const hasRealProfile = (pk: string) => {
        const p = allProfiles.get(pk);
        if (!p) return false;
        const name = (p.display_name || p.name || "").trim();
        if (name.length < 2) return false;
        const lower = name.toLowerCase();
        if (lower === "anonymous" || lower.includes("bot") || lower.includes("auto") || lower.includes("weather")) return false;
        return true;
      };
      const filtered = events.filter((e: Event) => hasRealProfile(e.pubkey));
      return { posts: filtered, profiles: allProfiles };
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage: { posts: Event[] }) => {
      if (lastPage.posts.length === 0) return undefined;
      // Use oldest post timestamp as cursor for next page
      const oldest = lastPage.posts[lastPage.posts.length - 1];
      return oldest.created_at - 1;
    },
    placeholderData: (prev: any) => prev,
  });

  // Flatten all pages into single lists
  const allPosts = feedData?.pages.flatMap(p => p.posts) ?? [];
  const allProfiles = new Map<string, UserProfile>();
  feedData?.pages.forEach(p => p.profiles.forEach((v, k) => allProfiles.set(k, v)));
  const posts = allPosts;
  const profiles = allProfiles;
  const loading = isPending && posts.length === 0;

  // Track sort changes for loading overlay
  const [sortChanging, setSortChanging] = useState(false);
  const prevSortRef = useRef(feedSort);
  useEffect(() => {
    if (prevSortRef.current !== feedSort) {
      setSortChanging(true);
      prevSortRef.current = feedSort;
    }
  }, [feedSort]);
  useEffect(() => {
    if (!isFetching && sortChanging) setSortChanging(false);
  }, [isFetching, sortChanging]);

  const handlePost = async () => {
    if (readOnly || !compose.trim()) return;
    setPosting(true);
    try {
      let content = compose.trim();
      if (imgUrl.trim()) {
        content += `\n\n${imgUrl.trim()}`;
      }
      await signAndPublish({ kind: 1, content });
      setCompose("");
      setImgUrl("");
      setShowImgInput(false);
      setComposing(false);
      queryClient.invalidateQueries({ queryKey: ["feed"] });
    } catch (e: any) {
      console.error("post error:", e.message);
    }
    setPosting(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const url = await uploadToNostrBuild(file, signEvent);
      setImgUrl(url);
    } catch (err: any) {
      console.error("upload error:", err.message);
      setUploadError("Upload failed. Try pasting a URL instead.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addEmoji = (emoji: string) => {
    setCompose(prev => prev + emoji);
    setShowEmoji(false);
  };

  const addTopic = (topic: string) => {
    setCompose(prev => (prev && !prev.endsWith(" ") ? prev + " " : prev) + `#${topic} `);
    setShowTopics(false);
  };

  const EMOJIS = ["👍","❤️","🔥","🚀","💯","👏","🙏","💡","⚡","🤝","✅","🎉"];
  const TOPICS = ["bitcoin","nostr","lightning","web3","privacy","opensource","crypto","decentralized"];

  const myPic = profile?.picture;
  const myName = profile?.display_name || profile?.name || "You";

  return (
    <>
      {/* ── Left Sidebar ── */}
      <aside className="sidebar-left">
        {isLoggedIn ? (
          <>
            <div className="card">
              <div className="profile-card-top" style={{
                background: profile?.banner
                  ? `url(${profile.banner}) center/cover`
                  : 'linear-gradient(135deg, #064e3b, #065f46, #047857)',
              }} />
              <Link to={`/in/${npubFromHex(pubkey)}`} className="profile-card-avatar" style={{
                background: myPic ? '#262626' : 'linear-gradient(135deg, #10b981, #059669)',
                textDecoration: 'none',
              }}>
                {myPic ? <img src={myPic} alt="" /> : (
                  <span style={{ color: '#fff' }}>{myName.slice(0, 1).toUpperCase()}</span>
                )}
              </Link>
              <div className="profile-card-body">
                <Link to={`/in/${npubFromHex(pubkey)}`} className="profile-card-name" style={{ textDecoration: 'none', color: 'inherit' }}>
                  {myName}
                </Link>
                <div className="profile-card-headline">
                  {profile?.about ? profile.about.slice(0, 100) : "No headline yet"}
                </div>
              </div>
              <hr className="profile-card-divider" />
              <div className="profile-card-stat">
                <span>Profile viewers</span>
                <strong>–</strong>
              </div>
              <div className="profile-card-stat">
                <span>Connections</span>
                <strong>–</strong>
              </div>
            </div>

            <div className="card" style={{ marginTop: 8 }}>
              <div className="discovery-card">
                <h4>Recent</h4>
                <div className="discovery-item"><div className="discovery-dot" /> Nostr</div>
                <div className="discovery-item"><div className="discovery-dot" /> Bitcoin</div>
                <div className="discovery-item"><div className="discovery-dot" /> Lightning</div>
                <div className="discovery-item"><div className="discovery-dot" /> Web3</div>
              </div>
            </div>
          </>
        ) : (
          /* ── Login card for logged-out users ── */
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {connectUri ? (
              /* ── QR Pairing ── */
              <div style={{ padding: '24px', textAlign: 'center' }}>
                {authError ? (
                  /* Error */
                  <>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#2a1010', border: '2px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                      <XCircle size={28} color="#ef4444" />
                    </div>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Connection failed</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>{authError}</p>
                  </>
                ) : (
                  /* Waiting */
                  <>
                    <div className="pulse-ring" style={{ display: 'inline-block', padding: 12, border: '2px solid var(--accent)', borderRadius: 10, marginBottom: 16, background: '#fff' }}>
                      <QRCodeSVG value={connectUri} size={160} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                      <Loader2 size={14} color="var(--accent)" className="spin" />
                      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>Waiting for signer...</p>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Scan with Primal, Clave, or Amber</p>
                  </>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {!authError && (
                    <button
                      onClick={() => { window.location.href = connectUri; }}
                      style={{ width: '100%', padding: '10px 16px', borderRadius: 24, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <Zap size={14} /> Open Signer App
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => navigator.clipboard.writeText(connectUri).catch(() => {})} style={{ flex: 1, padding: '10px 12px', borderRadius: 24, background: 'transparent', border: '1px solid var(--surface-border)', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Copy size={14} /> Copy URI
                    </button>
                    <button onClick={cancelConnect} style={{ flex: 1, padding: '10px 12px', borderRadius: 24, background: 'transparent', border: '1px solid var(--surface-border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
                      {authError ? 'Try again' : 'Cancel'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div style={{
                  background: 'linear-gradient(135deg, #064e3b, #065f46, #047857)',
                  padding: '32px 24px 24px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: '#fff', marginBottom: 4 }}>⟠ NostrLink</div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>Professional networking, decentralized.</div>
                </div>
                <div style={{ padding: '20px 24px 24px' }}>
                  {authError && <div style={{ background: '#2a1010', color: '#ef4444', padding: '8px 12px', borderRadius: 4, fontSize: 13, marginBottom: 12, border: '1px solid #4a1515' }}>{authError}</div>}

                  {/* Tabs */}
                  <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid var(--surface-border)' }}>
                    <button onClick={() => setLoginTab("signer")} style={{ flex: 1, padding: '8px 4px', background: 'none', border: 'none', borderBottom: loginTab === "signer" ? '2px solid var(--accent)' : '2px solid transparent', color: loginTab === "signer" ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Zap size={14} /> Signer
                    </button>
                    {nip07Available && (
                      <button onClick={() => setLoginTab("extension")} style={{ flex: 1, padding: '8px 4px', background: 'none', border: 'none', borderBottom: loginTab === "extension" ? '2px solid var(--accent)' : '2px solid transparent', color: loginTab === "extension" ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Plug size={14} /> Extension
                      </button>
                    )}
                    <button onClick={() => setLoginTab("nsec")} style={{ flex: 1, padding: '8px 4px', background: 'none', border: 'none', borderBottom: loginTab === "nsec" ? '2px solid var(--accent)' : '2px solid transparent', color: loginTab === "nsec" ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Key size={14} /> nsec
                    </button>
                    <button onClick={() => setLoginTab("npub")} style={{ flex: 1, padding: '8px 4px', background: 'none', border: 'none', borderBottom: loginTab === "npub" ? '2px solid var(--accent)' : '2px solid transparent', color: loginTab === "npub" ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <UserCircle size={14} /> npub
                    </button>
                  </div>

                  {/* Signer tab */}
                  {loginTab === "signer" && (
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>Scan a QR code with your Nostr signer app (Clave, Amber, Primal) via NIP-46.</p>
                      <button onClick={startConnect} disabled={authLoading} style={{ width: '100%', padding: '10px 16px', borderRadius: 24, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <Zap size={18} /> Connect with Signer
                      </button>
                    </div>
                  )}

                  {/* Extension tab */}
                  {loginTab === "extension" && (
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>Use your browser extension (Alby, nos2x) to sign in.</p>
                      <button onClick={loginNip07} disabled={authLoading} style={{ width: '100%', padding: '10px 16px', borderRadius: 24, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <Plug size={18} /> Connect with Extension
                      </button>
                    </div>
                  )}

                  {/* nsec tab */}
                  {loginTab === "nsec" && (
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>Enter your private key. Key stays in browser memory.</p>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                        <input
                          type={showKey ? "text" : "password"}
                          placeholder="nsec1..."
                          value={keyInput}
                          onChange={e => setKeyInput(e.target.value)}
                          style={{ flex: 1, padding: '8px 12px', background: 'var(--surface-hover)', border: '1px solid var(--surface-border)', borderRadius: 4, color: 'var(--text)', fontSize: 13, outline: 'none' }}
                        />
                        <button onClick={() => setShowKey(!showKey)} style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', padding: '0 8px' }}>
                          {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <button onClick={() => loginNsec(keyInput.trim())} disabled={!keyInput.trim() || authLoading} style={{ width: '100%', padding: '10px 16px', borderRadius: 24, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <Key size={18} /> Sign in
                      </button>
                    </div>
                  )}

                  {/* npub tab */}
                  {loginTab === "npub" && (
                    <div>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>Enter your public key for read-only access.</p>
                      <input
                        type="text"
                        placeholder="npub1..."
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', background: 'var(--surface-hover)', border: '1px solid var(--surface-border)', borderRadius: 4, color: 'var(--text)', fontSize: 13, outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
                      />
                      <button onClick={() => loginNpub(keyInput.trim())} disabled={!keyInput.trim() || authLoading} style={{ width: '100%', padding: '10px 16px', borderRadius: 24, background: 'var(--accent)', color: '#fff', fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <UserCircle size={18} /> Browse (Read-Only)
                      </button>
                    </div>
                  )}

                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12, textAlign: 'center', lineHeight: 1.5 }}>
                    {loginTab === "signer" ? "Keys never leave your signer app." : loginTab === "npub" ? "Read-only — browse without posting." : ""}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </aside>

      {/* ── Main Feed ── */}
      <main className="main-feed">
        {isLoggedIn && !readOnly && (
          <div className="card compose-card">
            {composing ? (
              <div className="compose-modal">
                <div className="compose-modal-header">
                  <h3>Create a post</h3>
                  <button className="btn-ghost" onClick={() => setComposing(false)}>✕</button>
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                  <div className="compose-avatar" style={{
                    background: myPic ? '#262626' : 'linear-gradient(135deg, #10b981, #059669)',
                  }}>
                    {myPic ? <img src={myPic} alt="" /> : (
                      <span style={{ color: '#fff' }}>{myName.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{myName}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>
                      <Globe size={12} /> Public · Nostr
                    </div>
                  </div>
                </div>
                <textarea
                  className="compose-textarea"
                  placeholder="What do you want to talk about?"
                  value={compose}
                  onChange={(e) => setCompose(e.target.value)}
                  autoFocus
                />
                <div className="compose-modal-footer">
                  <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                      />
                      <button className="btn-ghost" onClick={() => fileInputRef.current?.click()} title="Add image" disabled={uploading}>
                        {uploading ? <Loader2 size={20} className="spin" /> : <Image size={20} />}
                      </button>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <button className="btn-ghost" onClick={() => { setShowEmoji(!showEmoji); setShowImgInput(false); setShowTopics(false); }} title="Add emoji">
                        <SmilePlus size={20} />
                      </button>
                      {showEmoji && (
                        <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: 8, display: 'flex', gap: 4, flexWrap: 'wrap', width: 220, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                          {EMOJIS.map(e => (
                            <button key={e} className="btn-ghost" style={{ fontSize: 18, padding: 4 }} onClick={() => addEmoji(e)}>{e}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ position: 'relative' }}>
                      <button className="btn-ghost" onClick={() => { setShowTopics(!showTopics); setShowImgInput(false); setShowEmoji(false); }} title="Add hashtag">
                        <Hash size={20} />
                      </button>
                      {showTopics && (
                        <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: 'var(--surface)', border: '1px solid var(--surface-border)', borderRadius: 8, padding: 8, display: 'flex', gap: 4, flexWrap: 'wrap', width: 260, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}>
                          {TOPICS.map(t => (
                            <button key={t} className="btn-ghost" style={{ fontSize: 13, padding: '4px 8px', color: 'var(--accent)' }} onClick={() => addTopic(t)}>#{t}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handlePost}
                    disabled={posting || !compose.trim()}
                  >
                    Post
                  </button>
                </div>
                {uploadError && (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#ef4444' }}>{uploadError}</div>
                )}
                {!imgUrl && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                      <span>or paste URL:</span>
                    </div>
                    <input
                      type="url"
                      placeholder="https://example.com/photo.jpg"
                      value={imgUrl}
                      onChange={e => { setImgUrl(e.target.value); setUploadError(""); }}
                      style={{ width: '100%', marginTop: 4, padding: '8px 12px', border: '1px solid var(--surface-border)', borderRadius: 4, background: 'var(--surface-hover)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
                {imgUrl && (
                  <div style={{ marginTop: 8, position: 'relative' }}>
                    <button className="btn-ghost" onClick={() => setImgUrl("")} style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, zIndex: 2 }}>✕</button>
                    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--surface-border)' }}>
                      <img src={imgUrl} alt="preview" style={{ width: '100%', maxHeight: 300, objectFit: 'cover' }} onError={e => (e.currentTarget.style.display = 'none')} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="compose-row">
                  <div className="compose-avatar" style={{
                    background: myPic ? '#262626' : 'linear-gradient(135deg, #10b981, #059669)',
                  }}>
                    {myPic ? <img src={myPic} alt="" /> : (
                      <span style={{ color: '#fff' }}>{myName.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <button className="compose-trigger" onClick={() => setComposing(true)}>
                    Start a post
                  </button>
                </div>
                <div className="compose-actions-bar">
                  <button className="compose-action-btn" onClick={() => { setComposing(true); setTimeout(() => fileInputRef.current?.click(), 100); }}>
                    <Image size={20} style={{ color: '#10b981' }} /> Media
                  </button>
                  <button className="compose-action-btn" onClick={() => { setComposing(true); setShowEmoji(true); }}>
                    <SmilePlus size={20} style={{ color: '#f59e0b' }} /> Emoji
                  </button>
                  <button className="compose-action-btn" onClick={() => { setComposing(true); setShowTopics(true); }}>
                    <Hash size={20} style={{ color: '#ef4444' }} /> Hashtags
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '4px 0', borderBottom: '1px solid var(--surface-border)' }}>
          {sortOptions.map(opt => (
            <button
              key={opt.key}
              onClick={() => setFeedSort(opt.key)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                padding: '8px 4px', fontSize: 13, fontWeight: feedSort === opt.key ? 600 : 400,
                color: feedSort === opt.key ? 'var(--accent)' : 'var(--text-muted)',
                background: 'none', border: 'none', borderBottom: feedSort === opt.key ? '2px solid var(--accent)' : '2px solid transparent',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <opt.icon size={14} />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div className="shimmer" style={{ width: 48, height: 48, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="shimmer" style={{ width: '40%', height: 14, borderRadius: 4, marginBottom: 8 }} />
                    <div className="shimmer" style={{ width: '25%', height: 12, borderRadius: 4 }} />
                  </div>
                </div>
                <div className="shimmer" style={{ width: '90%', height: 12, borderRadius: 4, marginTop: 16 }} />
                <div className="shimmer" style={{ width: '75%', height: 12, borderRadius: 4, marginTop: 8 }} />
              </div>
            ))}
          </>
        ) : posts.length === 0 ? (
          <div className="card empty-state" style={{ padding: 48 }}>
            <p style={{ fontSize: 16, fontWeight: 600 }}>No posts yet</p>
            <p>Be the first to share a professional update!</p>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {sortChanging && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 10,
                background: 'rgba(10,10,10,0.75)', backdropFilter: 'blur(4px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                padding: 40, borderRadius: 12,
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  <Loader2 size={20} className="spin" /> Loading…
                </div>
              </div>
            )}
            {posts.map((post) => (
              <PostCard key={post.id} post={post} profile={profiles.get(post.pubkey)} />
            ))}
          </div>
        )}

        {/* Infinite scroll sentinel — invisible, triggers fetch when visible */}
        <div
          ref={(el) => {
            if (!el) return;
            const obs = new IntersectionObserver(
              ([entry]) => {
                if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              },
              { rootMargin: "400px" }
            );
            obs.observe(el);
            // cleanup on unmount or re-render
            return () => obs.disconnect();
          }}
          style={{ height: 1 }}
        />
        {isFetchingNextPage && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              <Loader2 size={16} className="spin" /> Loading more…
            </div>
          </div>
        )}
      </main>

      {/* ── Right Sidebar ── */}
      <aside className="sidebar-right">
        <div className="card">
          <div className="news-card">
            <div className="news-card-title">Trending on Nostr</div>
            {posts.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0' }}>Loading…</div>
            ) : (
              posts
                .filter(p => p.content && p.content.length > 40 && !p.content.startsWith(' nostr'))
                .slice(0, 5)
                .map((post, i) => {
                  const author = profiles.get(post.pubkey);
                  const name = author?.display_name || author?.name || shortenPubkey(post.pubkey);
                  const preview = post.content
                    .replace(/https?:\/\/\S+/g, '')
                    .replace(/nostr:(npub|note|nevent)\w+/g, '')
                    .replace(/#[\w]+/g, '')
                    .trim()
                    .slice(0, 80);
                  return (
                    <Link key={post.id} to={`/post/${post.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div className="news-item" style={{ cursor: 'pointer' }}>
                        <div className="news-item-header">
                          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{name}</span>
                          <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{timeAgo(post.created_at)}</span>
                        </div>
                        <div className="news-item-title">{preview}{preview.length >= 80 ? '…' : ''}</div>
                      </div>
                    </Link>
                  );
                })
            )}
          </div>
        </div>

        <div className="card" style={{ marginTop: 8 }}>
          <div className="discovery-card">
            <h4>People you may know</h4>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
              Connect with more people on Nostr to grow your network.
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
