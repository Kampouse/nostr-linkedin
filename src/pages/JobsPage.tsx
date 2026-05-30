/**
 * JobsPage.tsx — LinkedIn-style jobs page
 */

import { useState } from "react";
import { Briefcase, MapPin, Clock, Bookmark, BookmarkCheck, Building2, Globe, DollarSign, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchJobs,
  fetchProfiles,
  timeAgo,
  shortenPubkey,
  npubFromHex,
  type UserProfile,
  type JobListing,
} from "../lib/nostr";

export default function JobsPage() {
  const [saved, setSaved] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem("saved-jobs");
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch { return new Set(); }
  });
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const { data = { jobs: [] as JobListing[], profiles: new Map<string, UserProfile>() } } = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const listings = await fetchJobs();
      const pubkeys = [...new Set(listings.map((j: JobListing) => j.event.pubkey))];
      const profiles = new Map<string, UserProfile>();
      if (pubkeys.length > 0) {
        const pMap = await fetchProfiles(pubkeys);
        for (const [k, v] of pMap) profiles.set(k, v);
      }
      return { jobs: listings, profiles };
    },
    placeholderData: (prev: any) => prev,
  });

  const jobs = data.jobs;
  const profiles = data.profiles;

  const toggleSave = (id: string) => {
    setSaved(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem("saved-jobs", JSON.stringify([...next]));
      return next;
    });
  };

  const active = selectedJob ? jobs.find(j => (j.event.id + j.d) === selectedJob) : null;
  const activeProfile = active ? profiles.get(active.event.pubkey) : null;

  return (
    <div className="jobs-grid">
      {/* ── Left Sidebar: Filters (desktop only) ── */}
      <aside className="jobs-sidebar">
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--surface-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 16 }}>
              <Filter size={18} /> Filters
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Date Posted</label>
              {["Any time", "Past 24h", "Past week", "Past month"].map((label, i) => (
                <label key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontSize: 14 }}>
                  <input type="radio" name="date" defaultChecked={i === 0} style={{ accentColor: "var(--accent)" }} />
                  {label}
                </label>
              ))}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.5 }}>Location Type</label>
              {["Any", "Remote", "On-site", "Hybrid"].map((label, i) => (
                <label key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer", fontSize: 14 }}>
                  <input type="radio" name="loc" defaultChecked={i === 0} style={{ accentColor: "var(--accent)" }} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="card" style={{ padding: "16px 20px", marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}>
            <Bookmark size={16} color="var(--accent)" />
            {saved.size} Saved Job{saved.size !== 1 ? "s" : ""}
          </div>
        </div>
      </aside>

      {/* ── Main: Job Listings ── */}
      <main className="jobs-main">
        <div className="card" style={{ padding: 0 }}>
          <div style={{
            padding: "20px 24px", borderBottom: "1px solid var(--surface-border)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
                <Briefcase size={22} color="var(--accent)" /> Jobs
              </h2>
              <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                {jobs.length} listing{jobs.length !== 1 ? "s" : ""} on Nostr
              </p>
            </div>
          </div>

          {jobs.length === 0 ? (
            <div className="empty-state">
              <Briefcase size={48} strokeWidth={1} color="var(--text-muted)" />
              <p style={{ fontSize: 16, fontWeight: 600 }}>No job listings found</p>
              <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Jobs are posted as NIP-99 listings (kind 30402).</p>
            </div>
          ) : (
            jobs.map((job) => {
              const author = profiles.get(job.event.pubkey);
              const name = author?.display_name || author?.name || shortenPubkey(job.event.pubkey);
              const pic = author?.picture;
              const key = job.event.id + job.d;
              const isSelected = selectedJob === key;
              return (
                <div
                  key={key}
                  onClick={() => setSelectedJob(key)}
                  className="job-card-item"
                  style={{
                    background: isSelected ? "var(--hover-bg)" : undefined,
                    borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{
                        width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                        background: pic ? `url(${pic}) center/cover` : "linear-gradient(135deg, #10b981, #059669)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 700, fontSize: 18,
                      }}>
                        {pic ? "" : name.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{job.title}</div>
                        <div style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 2 }}>{name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: 13, marginTop: 4 }}>
                          <MapPin size={13} /> {job.location || "Remote"}
                          {job.salary && (<><span>·</span><DollarSign size={13} />{job.salary}</>)}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
                          <Clock size={12} /> {timeAgo(job.event.created_at)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); toggleSave(key); }}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: saved.has(key) ? "var(--accent)" : "var(--text-muted)" }}
                    >
                      {saved.has(key) ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
                    </button>
                  </div>
                  {job.category && (
                    <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                      <span className="job-tag">{job.category}</span>
                      <span className="job-tag">Nostr</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* ── Right Sidebar: Job Detail (desktop) ── */}
      <aside className="jobs-right">
        {active ? (
          <div className="card job-detail-card" style={{ padding: 0 }}>
            <JobDetail
              job={active}
              profile={activeProfile}
              saved={saved.has(selectedJob!)}
              onToggleSave={() => toggleSave(selectedJob!)}
              onClose={() => setSelectedJob(null)}
            />
          </div>
        ) : (
          <div className="card" style={{ padding: "40px 24px", textAlign: "center" }}>
            <Briefcase size={40} strokeWidth={1} color="var(--text-muted)" />
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 12 }}>Select a job</div>
            <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>Click a listing to see details</div>
          </div>
        )}
      </aside>

      {/* ── Mobile: Full-screen job detail overlay ── */}
      {active && (
        <div className="job-detail-mobile">
          <div className="card" style={{ padding: 0, margin: 0, borderRadius: 0, minHeight: "100vh" }}>
            <JobDetail
              job={active}
              profile={activeProfile}
              saved={saved.has(selectedJob!)}
              onToggleSave={() => toggleSave(selectedJob!)}
              onClose={() => setSelectedJob(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Shared job detail component used in sidebar + mobile overlay */
function JobDetail({ job, profile, saved, onToggleSave, onClose }: {
  job: JobListing;
  profile: UserProfile | undefined;
  saved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
}) {
  const name = profile?.display_name || profile?.name || shortenPubkey(job.event.pubkey);
  const pic = profile?.picture;
  return (
    <>
      {/* Back button */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid var(--surface-border)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1 }}
        >←</button>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Back to jobs</span>
      </div>

      {/* Header */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--surface-border)" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12, flexShrink: 0,
            background: pic ? `url(${pic}) center/cover` : "linear-gradient(135deg, #10b981, #059669)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 22,
          }}>
            {pic ? "" : name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{job.title}</div>
            <div style={{ fontSize: 15, color: "var(--text-secondary)", marginTop: 2 }}>{name}</div>
          </div>
        </div>

        {/* Meta chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          {job.location && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", background: "var(--surface)", borderRadius: 20, fontSize: 13, color: "var(--text-secondary)" }}>
              <MapPin size={14} /> {job.location}
            </div>
          )}
          {job.salary && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", background: "var(--surface)", borderRadius: 20, fontSize: 13, color: "var(--text-secondary)" }}>
              <DollarSign size={14} /> {job.salary}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", background: "var(--surface)", borderRadius: 20, fontSize: 13, color: "var(--text-secondary)" }}>
            <Clock size={14} /> {timeAgo(job.event.created_at)}
          </div>
        </div>

        {/* Buttons */}
        <button className="btn-primary" style={{ width: "100%", marginTop: 20, padding: "12px 0" }}>
          Apply Now
        </button>
        <button
          onClick={onToggleSave}
          style={{
            width: "100%", marginTop: 8, padding: "10px 0", background: "none",
            border: "1px solid var(--surface-border)", borderRadius: 24, color: "var(--text)",
            cursor: "pointer", fontSize: 15, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {saved ? <BookmarkCheck size={18} color="var(--accent)" /> : <Bookmark size={18} />}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      {/* Description */}
      {job.summary && (
        <div style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>About this role</div>
          <div style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {job.summary}
          </div>
        </div>
      )}

      {/* Tags */}
      <div style={{ padding: "0 24px 20px", display: "flex", gap: 6, flexWrap: "wrap" }}>
        {job.category && <span className="job-tag">{job.category}</span>}
        <span className="job-tag">Nostr</span>
        <span className="job-tag">Web3</span>
      </div>

      {/* Poster */}
      <div style={{ padding: "16px 24px", borderTop: "1px solid var(--surface-border)" }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 8 }}>Posted by</div>
        <a
          href={`https://in.jemartel.dev/in/${npubFromHex(job.event.pubkey)}`}
          target="_blank"
          rel="noopener"
          style={{ fontSize: 14, color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
        >
          {name} →
        </a>
      </div>
    </>
  );
}
