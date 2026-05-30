/**
 * Skeleton.tsx — Shimmer loading placeholders
 */

export function Skeleton({ w, h, radius }: { w?: string; h?: string; radius?: string }) {
  return (
    <div
      style={{
        width: w || "100%",
        height: h || "16px",
        borderRadius: radius || "4px",
        background: "var(--surface, #141414)",
        backgroundImage: "linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.04) 50%, transparent 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }}
    />
  );
}

export function FeedSkeleton() {
  return (
    <div style={{ maxWidth: 555, margin: "0 auto", width: "100%" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card" style={{ padding: 16, marginBottom: 8 }}>
          {/* Avatar + name row */}
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <Skeleton w="44px" h="44px" radius="50%" />
            <div style={{ flex: 1 }}>
              <Skeleton w="40%" h="14px" />
              <Skeleton w="25%" h="12px" />
            </div>
          </div>
          {/* Content lines */}
          <Skeleton w="100%" h="14px" />
          <Skeleton w="80%" h="14px" />
          {/* Action bar */}
          <div style={{ display: "flex", gap: 24, marginTop: 16 }}>
            <Skeleton w="48px" h="16px" />
            <Skeleton w="48px" h="16px" />
            <Skeleton w="48px" h="16px" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div style={{ maxWidth: 855, margin: "0 auto", width: "100%" }}>
      {/* Banner */}
      <Skeleton w="100%" h="180px" radius="0" />
      {/* Avatar */}
      <div style={{ marginTop: -60, padding: "0 32px" }}>
        <Skeleton w="128px" h="128px" radius="50%" />
      </div>
      {/* Name + headline */}
      <div style={{ padding: "16px 32px" }}>
        <Skeleton w="50%" h="28px" />
        <Skeleton w="70%" h="16px" />
        <Skeleton w="30%" h="14px" />
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Skeleton w="100px" h="32px" radius="16px" />
          <Skeleton w="100px" h="32px" radius="16px" />
          <Skeleton w="32px" h="32px" radius="16px" />
        </div>
      </div>
      {/* About section */}
      <div className="card" style={{ padding: 16, margin: "8px 0" }}>
        <Skeleton w="120px" h="20px" />
        <Skeleton w="100%" h="14px" />
        <Skeleton w="90%" h="14px" />
        <Skeleton w="60%" h="14px" />
      </div>
    </div>
  );
}
