# Dogfood QA Report

**Target:** https://in.jemartel.dev (NostrLink)
**Date:** 2026-05-30
**Scope:** Full site — all pages, navigation, search, feed, jobs, auth flow
**Tester:** Hermes Agent (automated exploratory QA)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 3 |
| 🟡 Medium | 4 |
| 🔵 Low | 2 |
| **Total** | **9** |

**Overall Assessment:** Core feed and navigation work well with zero console errors. Main gaps are missing profile navigation, non-functional job filters, and empty-state polish issues.

---

## Issues

### Issue #1: Clicking username on posts does not navigate to profile

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | Functional |
| **URL** | / (Home feed) |

**Description:**
Clicking a username link (e.g. "ODELL") on a post card does not navigate to that user's profile page. Instead, it appears to expand the post content inline. Users cannot discover other profiles from the feed.

**Steps to Reproduce:**
1. Load the home feed
2. Click on any username link (e.g. "ODELL", "calle", "jimmysong")

**Expected Behavior:** Navigate to `/profile/{npub}` showing the user's profile, their posts, followers, etc.

**Actual Behavior:** Stays on the feed page, sometimes expands post content. No profile navigation occurs.

---

### Issue #2: "Most Zapped" feed tab shows empty content

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | Functional |
| **URL** | / (Home feed, "Most Zapped" tab) |

**Description:**
Clicking the "Most Zapped" tab loads the tab UI but displays zero posts. The main content area is empty while Trending, Latest, and Popular tabs all load content correctly.

**Steps to Reproduce:**
1. Navigate to the home feed
2. Click "Most Zapped" tab

**Expected Behavior:** Shows posts sorted by zap amount/receipts

**Actual Behavior:** Empty feed — no posts, no loading indicator, no empty-state message

---

### Issue #3: Job filters (Date Posted, Location Type) don't filter results

| Field | Value |
|-------|-------|
| **Severity** | 🟠 High |
| **Category** | Functional |
| **URL** | /jobs |

**Description:**
The Jobs page has radio button filters for "Date Posted" (Any time / Past 24h / Past week / Past month) and "Location Type" (Any / Remote / On-site / Hybrid). Selecting any filter option does not change the displayed listings — the same 30 jobs appear regardless of filter selection.

**Steps to Reproduce:**
1. Navigate to /jobs
2. Select "Remote" under Location Type
3. Observe job count remains 30 with no visible filtering

**Expected Behavior:** Job list should filter to show only matching results. Count should update.

**Actual Behavior:** All 30 jobs shown regardless of filter selection. Filters are purely visual with no functional effect.

---

### Issue #4: Search result click does not navigate to profile

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | Functional |
| **URL** | / (Search bar) |

**Description:**
Typing in the search bar shows a dropdown with matching profiles (e.g. searching "ODELL" shows "ODELL" and "Mark B Tomlinson"). Clicking a search result does not navigate to that profile page — it stays on the current feed.

**Steps to Reproduce:**
1. Type "ODELL" in the search bar
2. Wait for dropdown results to appear
3. Click "ODELL" in the dropdown

**Expected Behavior:** Navigate to ODELL's profile page

**Actual Behavior:** Page stays on the feed, search dropdown closes

---

### Issue #5: 404 / unknown routes show blank page

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX |
| **URL** | /nonexistent-page |

**Description:**
Navigating to any non-existent route (e.g. /nonexistent-page) shows only the navigation bar with no content. There is no "Page not found" message or redirect.

**Steps to Reproduce:**
1. Navigate to https://in.jemartel.dev/nonexistent-page

**Expected Behavior:** A 404 page with "Page not found" message and link back to home

**Actual Behavior:** Blank page with only the top nav visible

---

### Issue #6: "People you may know" sidebar is empty with no explanation

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX |
| **URL** | / (Home feed sidebar) |

**Description:**
The sidebar shows a "People you may know" heading but no user suggestions. There is no empty-state message explaining why (e.g. "Sign in to see suggestions" or "Connect with more people on Nostr to grow your network" appears only sometimes).

**Steps to Reproduce:**
1. Load the home feed without being signed in
2. Observe the right sidebar "People you may know" section

**Expected Behavior:** Either show suggested profiles, or a clear empty-state message explaining why there are no suggestions

**Actual Behavior:** Shows heading "People you may know" with no content below it

---

### Issue #7: Empty pages for Messaging and Notifications lack guidance

| Field | Value |
|-------|-------|
| **Severity** | 🟡 Medium |
| **Category** | UX |
| **URL** | /messaging, /notifications |

**Description:**
Both Messaging and Notifications pages show only a heading and search bar (Messaging) or just a heading (Notifications) with no empty-state guidance. Users don't know if they need to sign in or if there's genuinely nothing there.

**Steps to Reproduce:**
1. Navigate to /messaging or /notifications without being signed in

**Expected Behavior:** Empty state message like "Sign in to see your messages" or "No notifications yet"

**Actual Behavior:** Just a heading with no content or explanation

---

### Issue #8: Jobs page shows profile hex IDs instead of names for some listings

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | Visual |
| **URL** | /jobs |

**Description:**
Some job listings show truncated hex pubkey identifiers (e.g. "c9dac14b…3b08", "d9b12978…3a1a", "f549dcbd…1019") instead of human-readable names. This happens when the profile hasn't set a display name, but the UI could fall back to a more readable format.

**Steps to Reproduce:**
1. Navigate to /jobs
2. Observe listings for "Prometheus", "Libertas Amsterdam VPN 1", "Small code fix or diagnosis"

**Expected Behavior:** Show "Anonymous" or a placeholder, not raw hex

**Actual Behavior:** Shows truncated hex pubkeys like "c9dac14b…3b08"

---

### Issue #9: Most jobs listings are products/services, not actual jobs

| Field | Value |
|-------|-------|
| **Severity** | 🔵 Low |
| **Category** | Content |
| **URL** | /jobs |

**Description:**
The Jobs page aggregates NIP-99 classified listings (kind 30402), which on Nostr include products, services, and marketplace items — not just job openings. The current feed shows leather coasters, VPN services, etchings, honey, and e-books alongside actual freelance gigs. The page title "Jobs" doesn't match the mixed content.

**Steps to Reproduce:**
1. Navigate to /jobs
2. Scroll through listings

**Expected Behavior:** Filter to show only actual job/gig listings, or rename the page to "Marketplace"

**Actual Behavior:** Shows all classified listings including physical products, digital goods, and services

---

## Issues Summary Table

| # | Title | Severity | Category | URL |
|---|-------|----------|----------|-----|
| 1 | Username click doesn't navigate to profile | 🟠 High | Functional | / |
| 2 | "Most Zapped" tab shows empty feed | 🟠 High | Functional | / |
| 3 | Job filters don't filter results | 🟠 High | Functional | /jobs |
| 4 | Search result click doesn't navigate | 🟡 Medium | Functional | / |
| 5 | 404/unknown routes show blank page | 🟡 Medium | UX | /nonexistent-page |
| 6 | "People you may know" sidebar empty | 🟡 Medium | UX | / |
| 7 | Messaging/Notifications lack empty-state guidance | 🟡 Medium | UX | /messaging, /notifications |
| 8 | Jobs show hex pubkeys instead of names | 🔵 Low | Visual | /jobs |
| 9 | Jobs page shows products/services, not just jobs | 🔵 Low | Content | /jobs |

## Testing Coverage

### Pages Tested
- Home feed (/) — all 4 tabs (Trending, Latest, Popular, Most Zapped)
- Post detail page (clicking post content)
- Jobs page (/jobs) — filters, listings, expanded view
- Network page (/network) — connections
- Messaging page (/messaging)
- Notifications page (/notifications)
- 404 route (/nonexistent-page)

### Features Tested
- Feed tab switching and content loading
- Post content click-through to detail
- Search bar with autocomplete dropdown
- Search result click
- Username click on post cards
- Job filter radio buttons (Date Posted, Location Type)
- Navigation between all pages
- Sign-in dropdown
- Back button from post detail

### Not Tested / Out of Scope
- NIP-46 signer connection (requires signer app)
- nsec/npub key input (requires keys)
- Posting, replying, zapping (requires auth)
- Messaging (requires auth)
- Job saving/bookmarking
- Profile viewing (could not navigate to any profile)

### Blockers
- Could not test any authenticated features (requires Nostr signer app)
- Profile navigation appears broken, blocking profile page testing

---

## Notes

**Positive findings:**
- Zero JavaScript console errors across all pages — very clean
- Fast page loads, no perceptible lag
- SPA navigation works smoothly between pages
- Feed data loads reliably from Primal Cache
- Search autocomplete works well and finds relevant profiles
- Job listings load 30 results consistently
- Post detail page renders correctly with reply field
- Dark theme is cohesive and professional

**Priority recommendations:**
1. Fix profile navigation (#1, #4) — this is core LinkedIn functionality
2. Fix "Most Zapped" tab (#2) — either make it work or remove it
3. Implement job filtering (#3) — currently cosmetic only
