/**
 * ProfilePage.tsx — Consistent profile layout for own + other profiles
 */

import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Save, Globe, Pencil, Copy, Link as LinkIcon,
  Plus, MoreHorizontal, Eye, BarChart3, User,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { nip19 } from "nostr-tools";
import {
  shortenPubkey, npubFromHex, hexFromNpub, fetchProfiles, fetchProfile,
  fetchFeedForPubkeys, fetchFollows, fetchProfiles as fetchMoreProfiles,
  invalidateProfileCache, timeAgo,
  pool, READ_RELAYS, type UserProfile, type Event, type JobListing,
} from "../lib/nostr";
import PostCard from "../components/PostCard";

export default function ProfilePage({ npub: npubProp }: { npub?: string }) {
  const npubValue = npubProp;
  const { pubkey: myPk, profile: myProfile, readOnly, refreshProfile, signAndPublish } = useAuth();

  const [targetPk, setTargetPk] = useState<string | null>(null);
  const [targetProfile, setTargetProfile] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UserProfile>({});
  const [copied, setCopied] = useState(false);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [follows, setFollows] = useState<string[]>([]);
  const [followProfiles, setFollowProfiles] = useState<Map<string, UserProfile>>(new Map());
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Resolve pubkey from npub param
  useEffect(() => {
    if (npubValue) {
      try {
        const decoded = nip19.decode(npubValue);
        setTargetPk(decoded.type === "npub" ? decoded.data as string : npubValue);
      } catch {
        setTargetPk(npubValue);
      }
    } else if (myPk) {
      setTargetPk(myPk);
    }
  }, [npubValue, myPk]);

  const isOwn = targetPk === myPk;
  const profile = isOwn ? myProfile : targetProfile;

  // Load profile + follows via useEffect (keeping existing pattern)
  useEffect(() => {
    if (!targetPk) return;
    const load = async () => {
      if (!isOwn) {
        const p = await fetchProfile(targetPk);
        setTargetProfile(p);
      }
      // Follows
      try {
        const list = await fetchFollows(targetPk);
        setFollows(list);
        if (list.length > 0) {
          const sample = list.slice(0, 5);
          const pMap = await fetchMoreProfiles(sample);
          setFollowProfiles(pMap);
        }
      } catch {}
    };
    load();
  }, [targetPk, isOwn]);

  // Activity via TanStack Query — same shape as feed cache for cross-page placeholder
  const { data: activityData } = useQuery({
    queryKey: ["profile-activity", targetPk],
    queryFn: async () => {
      if (!targetPk) return { posts: [] as Event[], profiles: new Map<string, UserProfile>() };
      const posts = await fetchFeedForPubkeys([targetPk]);
      const allProfiles = new Map<string, UserProfile>();
      if (posts.length > 0) {
        const pks = [...new Set(posts.map(e => e.pubkey))];
        const pMap = await fetchProfiles(pks);
        for (const [k, v] of pMap) allProfiles.set(k, v);
      }
      return { posts, profiles: allProfiles };
    },
    enabled: !!targetPk,
    placeholderData: (prev: any) => prev,
  });

  const activity = activityData?.posts?.slice(0, 5) ?? [];
  const activityProfiles = activityData?.profiles ?? new Map<string, UserProfile>();

  useEffect(() => {
    if (profile && !editing) setForm({ ...profile });
  }, [profile, editing]);

  const handleSave = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await signAndPublish({ kind: 0, content: JSON.stringify(form) });
      invalidateProfileCache(myPk!);
      setEditing(false);
      await new Promise(r => setTimeout(r, 1000));
      await refreshProfile();
    } catch (e: any) {
      console.error("save profile error:", e.message);
    }
    setSaving(false);
  };

  const displayName = profile?.display_name || profile?.name || "Anonymous";
  const avatar = profile?.picture;
  const initial = displayName.slice(0, 1).toUpperCase();
  const npub = targetPk ? npubFromHex(targetPk) : "";
  const about = profile?.about || null;
  const nip05 = profile?.nip05 || null;
  const website = profile?.website || null;
  const headline = about ? about.split('\n')[0].slice(0, 150) : nip05 || "";

  const handleCopyNpub = () => {
    navigator.clipboard.writeText(npub).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleConnect = async () => {
    if (readOnly || connected || !targetPk || !myPk) return;
    setConnecting(true);
    try {
      const currentFollows = await fetchFollows(myPk);
      if (currentFollows.includes(targetPk)) {
        setConnected(true);
        setConnecting(false);
        return;
      }
      const newTags = [...currentFollows.map(pk => ["p", pk] as string[]), ["p", targetPk]];
      await signAndPublish({ kind: 3, content: "", tags: newTags });
      setConnected(true);
    } catch (e: any) {
      console.error("connect error:", e.message);
    }
    setConnecting(false);
  };

  const handleCopyProfileLink = () => {
    const url = `${window.location.origin}/in/${npub}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedLink(true);
      setShowMore(false);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  const extractSkills = (text: string | null): string[] => {
    if (!text) return [];
    const matches = text.match(/#[\w]+/g);
    return matches ? [...new Set(matches)].map(t => t.slice(1)).slice(0, 5) : [];
  };
  const skills = extractSkills(about);

  // ── Edit mode ──
  if (editing) {
    return (
      <div style={{ maxWidth: 855, margin: '0 auto' }}>
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 24px' }}>Edit profile</h2>
          <div className="field"><label>Display name</label>
            <input type="text" value={form.display_name || ""} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="Your name" />
          </div>
          <div className="field"><label>Username</label>
            <input type="text" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="@username" />
          </div>
          <div className="field"><label>Headline / About</label>
            <textarea value={form.about || ""} onChange={(e) => setForm({ ...form, about: e.target.value })} placeholder="Tell people about yourself" rows={5} />
          </div>
          <div className="field"><label>Profile picture URL</label>
            <input type="text" value={form.picture || ""} onChange={(e) => setForm({ ...form, picture: e.target.value })} placeholder="https://..." />
          </div>
          <div className="field"><label>Banner URL</label>
            <input type="text" value={form.banner || ""} onChange={(e) => setForm({ ...form, banner: e.target.value })} placeholder="https://..." />
          </div>
          <div className="field"><label>Website</label>
            <input type="text" value={form.website || ""} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://yoursite.com" />
          </div>
          <div className="field"><label>NIP-05</label>
            <input type="text" value={form.nip05 || ""} onChange={(e) => setForm({ ...form, nip05: e.target.value })} placeholder="user@domain.com" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              <Save size={16} /> {saving ? "Saving..." : "Save"}
            </button>
            <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  const ABOUT_COLLAPSE = 280;

  // ── Shared profile layout — identical structure for own + other ──
  return (
    <div className="profile-grid-2col">
      {/* ── Left column ── */}
      <div>
        {/* ─── TOP CARD ─── */}
        <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
          {/* Banner */}
          <div className="profile-banner" style={{
            aspectRatio: '4 / 1',
            background: profile?.banner
              ? `url(${profile.banner}) center/cover`
              : 'linear-gradient(135deg, #064e3b 0%, #065f46 30%, #047857 60%, #059669 100%)',
            position: 'relative',
          }}>
            {!profile?.banner && (
              <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(ellipse at 30% 50%, rgba(16,185,129,0.12) 0%, transparent 60%), radial-gradient(ellipse at 75% 30%, rgba(52,211,153,0.08) 0%, transparent 50%)',
              }} />
            )}
          </div>

          {/* Identity section */}
          <div className="profile-top-card-inner" style={{ padding: '0 32px 28px', position: 'relative' }}>
            {/* Avatar */}
            <div className="profile-avatar-wrap" style={{
              width: 168, height: 168, borderRadius: 84,
              border: '4px solid var(--surface)',
              marginTop: -84,
              background: avatar ? '#1a1a1a' : 'var(--surface)',
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', zIndex: 2,
            }}>
              {avatar ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={80} style={{ color: 'var(--accent)', opacity: 0.7 }} />}
            </div>

            {/* Name + buttons row — same layout for everyone */}
            <div className="profile-name-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="profile-name-h2" style={{ fontSize: 28, fontWeight: 700, margin: 0, lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {displayName}
                </h2>
                {headline && (
                  <p style={{ fontSize: 16, fontWeight: 400, color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.5 }}>
                    {headline}
                  </p>
                )}
              </div>

              {/* Buttons — consistent row */}
              <div className="profile-btns" style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 4, flexShrink: 0, marginLeft: 24 }}>
                {isOwn && !readOnly && (
                  <button className="btn-outline" onClick={() => setEditing(true)} style={{ fontSize: 14, padding: '8px 20px', fontWeight: 600 }}>
                    <Pencil size={14} /> Edit profile
                  </button>
                )}
                {isOwn && readOnly && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>🔒 Read-only</span>
                )}
                {!isOwn && (
                  <>
                    <button
                      className={connected ? 'btn-primary active' : 'btn-primary'}
                      onClick={handleConnect}
                      disabled={connecting || readOnly}
                      style={{ fontSize: 14, padding: '8px 24px', fontWeight: 600, ...(connected ? { background: 'var(--accent)', color: '#fff' } : {}) }}
                    >
                      {connected ? "✓ Connected" : connecting ? "Connecting…" : <><Plus size={16} /> Connect</>}
                    </button>
                    <Link to={`/messaging?dm=${targetPk}`} className="btn-outline" style={{ fontSize: 14, padding: '8px 16px', fontWeight: 600, textDecoration: 'none' }}>
                      Message
                    </Link>
                  </>
                )}
                {/* More dropdown — always present */}
                <div style={{ position: 'relative' }}>
                  <button className="btn-ghost" style={{ padding: '8px' }} onClick={() => setShowMore(!showMore)}>
                    <MoreHorizontal size={20} />
                  </button>
                  {showMore && (
                    <div style={{
                      position: 'absolute', right: 0, top: '100%', zIndex: 50,
                      background: 'var(--surface)', border: '1px solid var(--surface-border)',
                      borderRadius: 8, padding: '4px 0', minWidth: 200,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    }}>
                      <button className="btn-ghost" style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: 14, borderRadius: 0 }} onClick={handleCopyProfileLink}>
                        <Copy size={14} style={{ marginRight: 8 }} /> {copiedLink ? "Copied!" : "Copy profile link"}
                      </button>
                      <button className="btn-ghost" style={{ width: '100%', padding: '10px 16px', textAlign: 'left', fontSize: 14, borderRadius: 0 }} onClick={() => { handleCopyNpub(); setShowMore(false); }}>
                        <Copy size={14} style={{ marginRight: 8 }} /> {copied ? "Copied!" : "Copy npub"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Location · Contact info */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 14, color: 'var(--text-secondary)' }}>
              {nip05 && (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Globe size={14} /> {nip05}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                </>
              )}
              {website && (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <LinkIcon size={14} />
                    <a href={website} target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>
                      {website.replace(/^https?:\/\//, '')}
                    </a>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>·</span>
                </>
              )}
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <button className="btn-ghost" onClick={() => setShowContact(!showContact)} style={{ fontSize: 14, padding: 0, color: 'var(--accent)', fontWeight: 600 }}>
                  Contact info
                </button>
                {showContact && (
                  <div style={{
                    position: 'absolute', left: 0, top: '100%', zIndex: 50, marginTop: 8,
                    background: 'var(--surface)', border: '1px solid var(--surface-border)',
                    borderRadius: 8, padding: 16, minWidth: 280,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  }}>
                    <h4 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Contact info</h4>
                    {nip05 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 8 }}>
                        <Globe size={14} color="var(--text-muted)" />
                        <span style={{ color: 'var(--text-secondary)' }}>{nip05}</span>
                      </div>
                    )}
                    {website && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 8 }}>
                        <LinkIcon size={14} color="var(--text-muted)" />
                        <a href={website} target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>
                          {website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <Copy size={14} color="var(--text-muted)" />
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all', fontSize: 12 }}>
                        {npub.slice(0, 32)}…{npub.slice(-8)}
                      </span>
                      <button className="btn-ghost" onClick={handleCopyNpub} style={{ padding: 2, fontSize: 12 }}>
                        {copied ? "✓" : "Copy"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {copied && <span style={{ color: 'var(--accent)', fontSize: 12 }}>Copied!</span>}
            </div>

            {/* Connections */}
            <div style={{ marginTop: 12, fontSize: 14 }}>
              <Link to="/network" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                {follows.length} connection{follows.length !== 1 ? 's' : ''}
              </Link>
            </div>
          </div>
        </div>

        {/* ─── ABOUT ─── */}
        {about && (
        <div className="card" style={{ marginTop: 8, padding: '24px 32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>About</h2>
            {isOwn && !readOnly && (
              <button className="btn-ghost" style={{ fontSize: 13 }} onClick={() => setEditing(true)}><Pencil size={14} /></button>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <p style={{
              fontSize: 15, lineHeight: 1.7, margin: 0,
              color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
              maxHeight: aboutExpanded ? 'none' : `${ABOUT_COLLAPSE}px`,
              overflow: 'hidden',
            }}>
              {about}
            </p>
            {about.length > ABOUT_COLLAPSE && (
              <button
                className="btn-ghost"
                onClick={() => setAboutExpanded(!aboutExpanded)}
                style={{ marginTop: 8, color: 'var(--text-secondary)', fontWeight: 600, fontSize: 14 }}
              >
                {aboutExpanded ? 'Show less' : '…see more'}
              </button>
            )}
          </div>
        </div>
        )}

        {/* ─── SKILLS ─── */}
        {skills.length > 0 && (
          <div className="card" style={{ marginTop: 8, padding: '24px 32px' }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Skills</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              {skills.map((skill) => (
                <span key={skill} style={{
                  padding: '6px 16px', borderRadius: 20,
                  border: '1px solid var(--accent)', color: 'var(--accent)',
                  fontSize: 14, fontWeight: 500,
                }}>
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── ACTIVITY ─── */}
        <div className="card" style={{ marginTop: 8, padding: '24px 32px 8px' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Activity</h2>
          {activity.length > 0 ? (
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '8px 0 16px' }}>
              {activity.length} recent post{activity.length !== 1 ? 's' : ''}
            </p>
          ) : (
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '12px 0 0' }}>
              {isOwn ? "Your recent posts will appear here." : `${displayName} hasn't posted recently.`}
            </p>
          )}
        </div>
        {activity.map((post) => (
          <PostCard key={post.id} post={post} profile={activityProfiles.get(post.pubkey)} />
        ))}

        {/* ─── IDENTITY ─── */}
        <div className="card" style={{ marginTop: 8, padding: '16px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap', minWidth: 0 }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 12, lineHeight: 1.4 }}>
              {npub.slice(0, 20)}…{npub.slice(-12)}
            </span>
            <button className="btn-ghost" onClick={handleCopyNpub} style={{ padding: 2 }} title="Copy npub">
              <Copy size={12} />
            </button>
            {copied && <span style={{ color: 'var(--accent)', fontSize: 11 }}>Copied!</span>}
          </div>
        </div>
      </div>

      {/* ── Right column — same structure for everyone ── */}
      <aside style={{ position: 'sticky', top: 72 }}>
        {/* Mini profile card — always shown */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 24,
              background: avatar ? `url(${avatar}) center/cover` : 'var(--surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {avatar ? '' : <User size={24} style={{ color: 'var(--accent)', opacity: 0.7 }} />}
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{displayName}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{nip05 || shortenPubkey(targetPk || '')}</div>
            </div>
          </div>
          <Link to={`/in/${npub}`} style={{ fontSize: 14, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>
            View profile →
          </Link>
        </div>

        {/* Analytics — always shown */}
        <div className="card" style={{ marginTop: 8, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <BarChart3 size={18} color="var(--text-muted)" />
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Analytics</h3>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{activity.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Posts</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{follows.length}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Connections</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>–</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                <Eye size={12} style={{ marginRight: 2 }} />Views
              </div>
            </div>
          </div>
        </div>

        {/* Suggested — always shown */}
        <div className="card" style={{ marginTop: 8, padding: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 16px' }}>Suggested for you</h3>
          {followProfiles.size > 0 ? (
            [...followProfiles.entries()].slice(0, 5).map(([pk, p]) => {
              const name = p?.display_name || p?.name || shortenPubkey(pk);
              const pic = p?.picture;
              return (
                <Link key={pk} to={`/in/${npubFromHex(pk)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 24,
                      background: pic ? `url(${pic}) center/cover` : 'var(--surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {pic ? '' : <User size={22} style={{ color: 'var(--accent)', opacity: 0.7 }} />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p?.about?.slice(0, 40) || shortenPubkey(pk)}</div>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Connect with more people on Nostr to see suggestions here.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
