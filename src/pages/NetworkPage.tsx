/**
 * NetworkPage.tsx — LinkedIn-style connections page
 */

import { Link } from "react-router-dom";
import { Users, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import {
  fetchFollows, fetchProfiles, shortenPubkey, npubFromHex,
  type UserProfile,
} from "../lib/nostr";

export default function NetworkPage() {
  const { pubkey } = useAuth();
  const queryClient = useQueryClient();

  const { data = { follows: [] as string[], profiles: new Map<string, UserProfile>() } } = useQuery({
    queryKey: ["network", pubkey],
    queryFn: async () => {
      if (!pubkey) return { follows: [] as string[], profiles: new Map<string, UserProfile>() };
      const list = await fetchFollows(pubkey);
      const profiles = new Map<string, UserProfile>();
      if (list.length > 0) {
        const pMap = await fetchProfiles(list);
        for (const [k, v] of pMap) profiles.set(k, v);
      }
      return { follows: list, profiles };
    },
    enabled: !!pubkey,
    placeholderData: (prev: any) => prev,
  });

  const follows = data.follows;
  const profiles = data.profiles;

  return (
    <div style={{ maxWidth: 555, margin: '0 auto', width: '100%' }}>
      <div className="card">
        <div className="network-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={24} /> Connections
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>
              {follows.length} connections
            </p>
          </div>
          <button className="btn-ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ["network", pubkey] })} title="Refresh">
            <RefreshCw size={18} />
          </button>
        </div>

        {follows.length === 0 ? (
          <div className="empty-state">
            <Users size={48} strokeWidth={1} color="var(--text-muted)" />
            <p style={{ fontSize: 16, fontWeight: 600 }}>No connections yet</p>
            <p>Follow people on any Nostr client to build your network.</p>
          </div>
        ) : (
          <div className="connection-grid">
            {follows.map((pk) => {
              const p = profiles.get(pk);
              const name = p?.display_name || p?.name || shortenPubkey(pk);
              const pic = p?.picture;
              return (
                <Link
                  key={pk}
                  to={`/in/${npubFromHex(pk)}`}
                  className="connection-item"
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div className="connection-avatar" style={{
                    background: pic ? '#262626' : 'linear-gradient(135deg, #10b981, #059669)',
                  }}>
                    {pic ? <img src={pic} alt="" /> : (
                      <span style={{ color: '#fff' }}>{name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <div className="connection-name">{name}</div>
                    {p?.about && <div className="connection-headline">{p.about.slice(0, 60)}</div>}
                    <span className="btn-outline" style={{ fontSize: 12, padding: '2px 12px', marginTop: 4, display: 'inline-block' }}>
                      View profile
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
