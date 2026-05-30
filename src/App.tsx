/**
 * App.tsx — Routes with keep-alive + Suspense
 */

import { BrowserRouter, useLocation, matchPath } from "react-router-dom";
import { Suspense, lazy, useMemo } from "react";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { KeepAliveProvider, KeepAlive, useKeepAliveContext } from "./components/KeepAlive";
import { FeedSkeleton, ProfileSkeleton } from "./components/Skeleton";
import Layout from "./components/Layout";

// Lazy load pages for code splitting
const FeedPage = lazy(() => import("./pages/FeedPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const JobsPage = lazy(() => import("./pages/JobsPage"));
const NetworkPage = lazy(() => import("./pages/NetworkPage"));
const MessagingPage = lazy(() => import("./pages/MessagingPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const PostDetailPage = lazy(() => import("./pages/PostDetailPage"));

/**
 * Derive the keep-alive slot ID from the current URL.
 * Profile pages get unique IDs per npub so different profiles are cached separately.
 */
function getKeepAliveId(pathname: string): string {
  const profileMatch = matchPath("/in/:npub", pathname);
  if (profileMatch) return `profile-${profileMatch.params.npub}`;
  const postMatch = matchPath("/post/:id", pathname);
  if (postMatch) return `post-${postMatch.params.id}`;
  if (pathname === "/" || pathname === "/feed") return "feed";
  if (pathname === "/network") return "network";
  if (pathname === "/jobs") return "jobs";
  if (pathname === "/messaging") return "messaging";
  if (pathname === "/notifications") return "notifications";
  return `other-${pathname}`;
}

/**
 * The keep-alive router — renders ALL visited pages simultaneously,
 * but only shows the active one. Inactive pages stay mounted (display:none).
 */
function KeepAliveRouter() {
  const location = useLocation();
  const { activate } = useKeepAliveContext();

  // Track which pages have been visited (so we only mount what's been seen)
  const visited = useMemo(() => new Set<string>(), []);
  const currentId = getKeepAliveId(location.pathname);

  visited.add(currentId);
  activate(currentId);

  // Scroll to top on every navigation
  window.scrollTo(0, 0);

  return (
    <>
      {/* Feed — always mounted once visited */}
      {visited.has("feed") && (
        <KeepAlive id="feed">
          <Suspense fallback={<FeedSkeleton />}>
            <FeedPage />
          </Suspense>
        </KeepAlive>
      )}

      {/* Network */}
      {visited.has("network") && (
        <KeepAlive id="network">
          <Suspense fallback={<FeedSkeleton />}>
            <NetworkPage />
          </Suspense>
        </KeepAlive>
      )}

      {/* Jobs */}
      {visited.has("jobs") && (
        <KeepAlive id="jobs">
          <Suspense fallback={<FeedSkeleton />}>
            <JobsPage />
          </Suspense>
        </KeepAlive>
      )}

      {/* Messaging */}
      {visited.has("messaging") && (
        <KeepAlive id="messaging">
          <Suspense fallback={<FeedSkeleton />}>
            <MessagingPage />
          </Suspense>
        </KeepAlive>
      )}

      {/* Notifications */}
      {visited.has("notifications") && (
        <KeepAlive id="notifications">
          <Suspense fallback={<FeedSkeleton />}>
            <NotificationsPage />
          </Suspense>
        </KeepAlive>
      )}

      {/* Dynamic profile pages — one slot per profile visited */}
      {[...visited]
        .filter(id => id.startsWith("profile-"))
        .map(id => {
          const npub = id.replace("profile-", "");
          return (
            <KeepAlive key={id} id={id}>
              <Suspense fallback={<ProfileSkeleton />}>
                <ProfilePageWrapper npub={npub} />
              </Suspense>
            </KeepAlive>
          );
        })}

      {/* Dynamic post detail pages — one slot per post */}
      {[...visited]
        .filter(id => id.startsWith("post-"))
        .map(id => {
          const postId = id.replace("post-", "");
          return (
            <KeepAlive key={id} id={id}>
              <Suspense fallback={<FeedSkeleton />}>
                <PostDetailPage postId={postId} />
              </Suspense>
            </KeepAlive>
          );
        })}
    </>
  );
}

/** Wrapper that passes npub as prop for keep-alive */
function ProfilePageWrapper({ npub }: { npub: string }) {
  return <ProfilePage npub={npub} />;
}

function AppRoutes() {
  const location = useLocation();

  // Public profile routes — always visible
  const profileMatch = matchPath("/in/:npub", location.pathname);
  if (profileMatch?.params.npub) {
    return (
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfilePage npub={profileMatch.params.npub} />
      </Suspense>
    );
  }

  // Post detail routes
  const postMatch = matchPath("/post/:id", location.pathname);
  if (postMatch?.params.id) {
    return (
      <Suspense fallback={<FeedSkeleton />}>
        <PostDetailPage postId={postMatch.params.id} />
      </Suspense>
    );
  }

  // Known routes — feed, network, jobs, messaging, notifications
  const knownRoutes = ["/", "/feed", "/network", "/jobs", "/messaging", "/notifications"];
  if (knownRoutes.includes(location.pathname)) {
    return <KeepAliveRouter />;
  }

  // 404 — unknown route
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>404</div>
      <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Page not found</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 24 }}>
        The page you're looking for doesn't exist.
      </p>
      <a href="/" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none", fontSize: 15 }}>
        ← Back to home
      </a>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <KeepAliveProvider initialId="feed">
            <AppRoutes />
          </KeepAliveProvider>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}
