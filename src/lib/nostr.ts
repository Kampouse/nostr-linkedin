/**
 * nostr.ts — Shared relay pool, event helpers, and constants
 * Uses Primal caching relay for fast feed queries, races relays for profiles.
 */

import { SimplePool, nip19 } from "nostr-tools";
import type { Event } from "nostr-tools";

export type { Event };

// ── Relays ──
export const NIP46_RELAYS = [
  "wss://relay.powr.build",
  "wss://relay.primal.net",
  "wss://relay.nip46.com",
  "wss://nos.lol",
];

// Primal is a caching relay — responds in ~280ms for notes
const FAST_RELAY = "wss://relay.snort.social";

// Primal Cache Server — scored/trending content
const PRIMAL_CACHE = "wss://cache2.primal.net/v1";

export const READ_RELAYS = [
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.snort.social",
  "wss://relay.nostr.net",
];

export const WRITE_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

// Relays that support NIP-50 search
export const SEARCH_RELAYS = [
  "wss://search.nos.today",
];

// ── Shared pool ──
export const pool = new SimplePool();

// ── Helpers ──

export function shortenPubkey(hex: string): string {
  return hex.slice(0, 8) + "…" + hex.slice(-4);
}

export function npubFromHex(hex: string): string {
  try {
    return nip19.npubEncode(hex);
  } catch {
    return shortenPubkey(hex);
  }
}

export function hexFromNpub(npub: string): string {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type === "npub") return decoded.data as string;
    return npub;
  } catch {
    return npub;
  }
}

export function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(ts * 1000).toLocaleDateString();
}

export function getTagValue(event: Event, tagName: string): string | undefined {
  return event.tags.find((t) => t[0] === tagName)?.[1];
}

export function getTagValues(event: Event, tagName: string): string[] {
  return event.tags.filter((t) => t[0] === tagName).map((t) => t[1]);
}

// ── Profile cache (in-memory + localStorage) ──
const PROFILE_TTL = 10 * 60 * 1000; // 10 min
const LS_KEY = "nostrlink_profiles";

interface CachedProfile {
  profile: UserProfile;
  fetched: number;
}

const profileCache = new Map<string, CachedProfile>();

// Hydrate from localStorage on load
try {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, CachedProfile>;
    for (const [pk, entry] of Object.entries(parsed)) {
      profileCache.set(pk, entry);
    }
  }
} catch {}

function persistProfiles() {
  try {
    const obj: Record<string, CachedProfile> = {};
    // Only persist last 200 profiles to stay under quota
    const entries = [...profileCache.entries()].slice(-200);
    for (const [pk, entry] of entries) {
      obj[pk] = entry;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch {}
}

/** Search cached profiles by name/npub (no relay roundtrip) */
export function searchCachedProfiles(query: string): (UserProfile & { pubkey: string })[] {
  const lower = query.toLowerCase();
  const results: (UserProfile & { pubkey: string })[] = [];
  for (const [pk, entry] of profileCache.entries()) {
    const p = entry.profile;
    const name = (p.display_name || p.name || "").toLowerCase();
    const npub = npubFromHex(pk).toLowerCase();
    if (name.includes(lower) || npub.includes(lower) || pk.includes(lower)) {
      results.push({ ...p, pubkey: pk });
    }
  }
  results.sort((a, b) => {
    const aName = (a.display_name || a.name || "").toLowerCase();
    const bName = (b.display_name || b.name || "").toLowerCase();
    const aStarts = aName.startsWith(lower) ? 0 : 1;
    const bStarts = bName.startsWith(lower) ? 0 : 1;
    return aStarts - bStarts || aName.localeCompare(bName);
  });
  return results.slice(0, 8);
}

/** Invalidate cached profile so next fetch hits relays */
export function invalidateProfileCache(pubkey: string) {
  profileCache.delete(pubkey);
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, CachedProfile>;
      delete parsed[pubkey];
      localStorage.setItem(LS_KEY, JSON.stringify(parsed));
    }
  } catch {}
}

export interface UserProfile {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  website?: string;
  nip05?: string;
  lud16?: string;
  bot?: boolean;
}

// Race across relays — return as soon as the FIRST relay responds with data
// For single-entity queries (profile/follows), returns on first event.
// For feeds, waits for EOSE from fast relay but caps at timeoutMs.
export async function fastQuery<T extends Event>(
  relays: string[],
  filter: { kinds: number[]; authors?: string[]; limit?: number; since?: number; search?: string },
  timeoutMs = 1500,
): Promise<T[]> {
  return new Promise((resolve) => {
    const collected: T[] = [];
    const seen = new Set<string>();

    const sub = pool.subscribeMany(relays, filter, {
      onevent(e: T) {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          collected.push(e);
        }
        // For single-entity queries (1 author), return immediately
        if ((filter.kinds[0] === 0 || filter.kinds[0] === 3) && (!filter.authors || filter.authors.length <= 1)) {
          sub.close();
          resolve(collected);
        }
      },
      oneose() {
        sub.close();
        resolve(collected);
      },
    });

    // Hard timeout — return whatever we have
    setTimeout(() => { sub.close(); resolve(collected); }, timeoutMs);
  });
}

export async function fetchProfile(pubkey: string): Promise<UserProfile> {
  const cached = profileCache.get(pubkey);
  if (cached && Date.now() - cached.fetched < PROFILE_TTL) {
    return cached.profile;
  }

  const events = await fastQuery(READ_RELAYS, {
    kinds: [0],
    authors: [pubkey],
    limit: 1,
  });

  const profile: UserProfile = {};
  if (events.length > 0) {
    // Take the most recent kind 0
    const sorted = events.sort((a, b) => b.created_at - a.created_at);
    try {
      Object.assign(profile, JSON.parse(sorted[0].content));
    } catch {}
  }

  profileCache.set(pubkey, { profile, fetched: Date.now() });
  persistProfiles();
  return profile;
}

export async function fetchProfiles(pubkeys: string[]): Promise<Map<string, UserProfile>> {
  const map = new Map<string, UserProfile>();
  const toFetch: string[] = [];

  for (const pk of pubkeys) {
    const cached = profileCache.get(pk);
    if (cached && Date.now() - cached.fetched < PROFILE_TTL) {
      map.set(pk, cached.profile);
    } else {
      toFetch.push(pk);
    }
  }

  if (toFetch.length > 0) {
    const events = await fastQuery(READ_RELAYS, {
      kinds: [0],
      authors: toFetch,
      limit: toFetch.length,
    }, 4000);

    for (const ev of events) {
      const profile: UserProfile = {};
      try {
        Object.assign(profile, JSON.parse(ev.content));
      } catch {}
      profileCache.set(ev.pubkey, { profile, fetched: Date.now() });
      map.set(ev.pubkey, profile);
    }

    for (const pk of toFetch) {
      if (!map.has(pk)) {
        map.set(pk, {});
      }
    }

    persistProfiles();
  }

  return map;
}

// ── Feed cache ──
const FEED_TTL = 30 * 1000; // 30 sec
const feedCache = new Map<string, { events: Event[]; fetched: number }>();

export async function fetchFeed(timeframe: string = "trending", until?: number): Promise<Event[]> {
  const cacheKey = `global:${timeframe}:${until || "first"}`;
  const cached = feedCache.get(cacheKey);
  if (cached && Date.now() - cached.fetched < FEED_TTL) {
    return cached.events;
  }

  const events = await fetchPrimalExplore(30, timeframe, until);

  feedCache.set(cacheKey, { events, fetched: Date.now() });
  return events;
}

/** Fetch scored content from Primal Cache Server */
async function fetchPrimalExplore(limit: number, timeframe: string, until?: number): Promise<Event[]> {
  try {
    const ws = new WebSocket(PRIMAL_CACHE);
    const events: Event[] = [];

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ws.close();
        resolve(events);
      }, 5000);

      ws.onopen = () => {
        ws.send(JSON.stringify(["REQ", "trending", {
          cache: ["explore", { scope: "global", timeframe, limit, ...(until ? { until } : {}) }]
        }]));
      };

      ws.onmessage = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (data[0] === "EVENT" && data[2]?.kind === 1) {
            const ev = data[2] as Event;
            // Basic content quality check
            if (ev.content && ev.content.length >= 10 && !ev.content.startsWith('{"')) {
              events.push(ev);
            }
          } else if (data[0] === "EOSE") {
            clearTimeout(timeout);
            ws.close();
            resolve(events);
          }
        } catch {}
      };

      ws.onerror = () => { clearTimeout(timeout); resolve(events); };
    });
  } catch {
    return [];
  }
}

export async function fetchFeedForPubkeys(pubkeys: string[]): Promise<Event[]> {
  if (pubkeys.length === 0) return [];
  const cacheKey = `pk:${pubkeys.sort().join(",")}`;
  const cached = feedCache.get(cacheKey);
  if (cached && Date.now() - cached.fetched < FEED_TTL) {
    return cached.events;
  }

  const events = await fastQuery<Event>(READ_RELAYS, {
    kinds: [1],
    authors: pubkeys,
    limit: 50,
  });

  const seen = new Set<string>();
  const deduped = events
    .filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
    .sort((a, b) => b.created_at - a.created_at);

  feedCache.set(cacheKey, { events: deduped, fetched: Date.now() });
  return deduped;
}

// ── Long-form articles (kind 30023) ──
export interface Article {
  event: Event;
  title: string;
  summary: string;
  image: string;
  publishedAt: number;
}

export async function fetchArticles(): Promise<Article[]> {
  const events = await pool.querySync([FAST_RELAY], {
    kinds: [30023],
    limit: 30,
  });

  return events
    .map((ev) => ({
      event: ev,
      title: getTagValue(ev, "title") || "Untitled",
      summary: getTagValue(ev, "summary") || "",
      image: getTagValue(ev, "image") || "",
      publishedAt: parseInt(getTagValue(ev, "published_at") || "0") || ev.created_at,
    }))
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

// ── Jobs (kind 30402 classifieds) ──
export interface JobListing {
  event: Event;
  title: string;
  summary: string;
  location: string;
  salary: string;
  category: string;
  d: string;
}

export async function fetchJobs(): Promise<JobListing[]> {
  const events = await pool.querySync([FAST_RELAY], {
    kinds: [30402],
    limit: 30,
  });
  const seen = new Set<string>();
  return events
    .filter((e) => { if (seen.has(e.id)) return false; seen.add(e.id); return true; })
    .map((ev) => ({
      event: ev,
      title: getTagValue(ev, "title") || "Untitled Position",
      summary: getTagValue(ev, "summary") || ev.content.slice(0, 200),
      location: getTagValue(ev, "location") || "Remote",
      salary: getTagValue(ev, "salary") || "",
      category: getTagValue(ev, "c") || "",
      d: getTagValue(ev, "d") || "",
    }))
    .sort((a, b) => b.event.created_at - a.event.created_at);
}

// ── Follow list (kind 3) ──
export async function fetchFollows(pubkey: string): Promise<string[]> {
  const events = await fastQuery<Event>(READ_RELAYS, {
    kinds: [3],
    authors: [pubkey],
    limit: 1,
  });
  if (events.length === 0) return [];
  return events[0].tags.filter((t) => t[0] === "p").map((t) => t[1]);
}

// ── Publish helper ──
export async function publishEvent(signedEvent: Event): Promise<void> {
  const results = await Promise.allSettled(
    [...WRITE_RELAYS, ...NIP46_RELAYS].map((r) =>
      pool.publish([r], signedEvent)
    )
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  console.log(`[nostr] published to ${ok}/${results.length} relays`);
}

// ── Note link helper ──
export function noteLink(eventId: string, relayHint?: string): string {
  try {
    return "https://njump.me/" + nip19.neventEncode({ id: eventId, relays: relayHint ? [relayHint] : READ_RELAYS.slice(0, 2) });
  } catch {
    return `https://njump.me/${eventId}`;
  }
}

// ── NIP-98 Image Upload ──
export async function uploadToNostrBuild(
  file: File,
  signEvent: (template: { kind: number; content: string; tags: string[][] }) => Promise<any>,
): Promise<string> {
  const authEvent = await signEvent({
    kind: 27235,
    content: "Upload to nostr.build",
    tags: [
      ["u", "https://nostr.build/api/v2/upload/files"],
      ["method", "POST"],
    ],
  });

  const formData = new FormData();
  formData.append("fileToUpload", file);

  const res = await fetch("https://nostr.build/api/v2/upload/files", {
    method: "POST",
    headers: {
      Authorization: `Nostr ${btoa(JSON.stringify(authEvent))}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const url = json?.data?.[0]?.url;
  if (!url) throw new Error("No URL in upload response");
  return url;
}
