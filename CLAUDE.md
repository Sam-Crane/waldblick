# Waldblick — Smart Forest Tracker

Mobile-first field tool for forest owners, foresters, and contractors to capture geotagged observations (photo + description + location), share them on a map, and coordinate work by urgency. Built for the Unterreiner forest-management challenge.

## What this repo is today

Static UI mockups only. No application runtime, no backend, no package manager. The design direction is locked; the app is not yet built.

```
stitch_smart_forest_tracker/
  forest_management_system/DESIGN.md   # design system — source of truth
  high_contrast_grid_map/code.html     # dashboard (map + inventory card)
  add_documentation/code.html          # new-observation form
  observation_details/code.html        # single-observation detail
  task_list/code.html                  # prioritized task queue
```

Each mockup is self-contained Tailwind via CDN. Inline `tailwind.config` blocks duplicate the same tokens defined in `DESIGN.md` — treat `DESIGN.md` as authoritative; HTML is illustrative.

## Core domain

- **Observation** — the unit of work. Fields: photo(s), description, GPS coordinates, timestamp, author, category (beetle, thinning, reforestation, windthrow, erosion, machine, other), priority (low / medium / critical), status (open / in_progress / resolved).
- **Task** — an observation that has been assigned for action, with an assignee and due date.
- **Plot / Stand** — a named polygon of forest (e.g. "Plot B-14", "Eastern Slope 4"). Observations belong to zero or one plot.
- **Actor roles** — owner, forester, contractor, machine operator. All see the same map; write permission varies.
- **Connection** — a directed or mutual link between two users within (or across) forests. Created via invite code. Required for direct messaging and task assignment across organizations.
- **Conversation + ChatMessage** — 1:1 messaging between connected users. Messages may link to an observation for context ("see this beetle trail"). Group chat deferred past v1.
- **Notification** — in-app alert for critical observations nearby, task assignment, new messages, connection requests, sync issues. Delivered via the top-bar bell and (once Capacitor wrap lands) push notifications.

## Four real-world scenarios the product must serve

1. **Beetle infestation** — owner marks trees, contractor fells them days later. System must prevent "lost markings" and spreading infestation.
2. **Thinning** — forester marks, external crew executes weeks later. System must carry selection criteria forward so the crew doesn't need the forester on site.
3. **Reforestation** — multiple teams plant different species in sections over weeks. System must answer "what was planted where, and what's left."
4. **Parallel machines** — harvesters, forwarders, maintenance crews in one area. System must show live positions and claimed paths to avoid collisions.

Design decisions that optimize for only one scenario and break another are wrong.

## Non-negotiable constraints

- **Offline-first.** Field areas have no signal. Capture, view own data, and see cached map tiles without network. Sync opportunistically.
- **Glove- and glare-proof.** 48px minimum touch target. Safety Orange primary CTAs. High contrast text.
- **Simple.** Users are not tech-savvy. A new observation must take ≤ 3 taps + photo + optional description.
- **Multi-user.** Multiple people edit simultaneously. Conflicts resolve last-write-wins per field; deletions are soft.

## Stack (locked)

**v1 is a PWA, iOS + Android first. Native app comes later once we validate the field UX.**

React + Vite + TypeScript · MapLibre GL JS (offline tile cache) · Dexie.js over IndexedDB · Supabase (Postgres + Auth + Storage + Realtime) · Workbox for service worker + background sync. See [implementation-plan.md](implementation-plan.md) for rationale and the v2 native plan.

## Map strategy: stacked sources

We use **one MapLibre canvas with multiple toggleable sources**, not separate map engines. Each source serves a different question:

| Source | Answers | Layer type | Notes |
|---|---|---|---|
| **Satellite basemap** (ESRI World Imagery or Bayern DOP) | "What's the terrain?" | Raster base | Always on |
| **BayernAtlas — DTK25 / DTK500** | "Where are forest roads and contours?" | Raster base (alt to satellite) | Free, attribution |
| **BayernAtlas — ALKIS Parzellarkarte** | "Which parcel is mine?" | Raster overlay, toggleable | Endpoint: `/od/wms/alkis/v1/parzellarkarte` |
| **BayernAtlas — ALKIS Tatsächliche Nutzung** | "Is this legally forest, meadow, or road?" | Raster overlay, toggleable | Endpoint: `/od/wms/alkis/v1/tn` |
| **LfU — Bodenkarte (BÜK200 / ÜBK25)** | "What soil? Which species will grow?" | Raster overlay, toggleable | Drives reforestation scenario |
| **LfU — Hydrogeologische Karte HK100** | "Erosion / washout risk?" | Raster overlay, toggleable | Useful after storms |
| **Our `observations` GeoJSON** | "Where are the problems?" | Vector data layer | Core product |
| **Our `plots` GeoJSON** | "Where are my subdivisions?" | Vector data layer | Admin-drawn, shown always |
| **Google Directions API** | "How do I drive there?" | Returned as polyline, drawn on MapLibre | NOT Google tiles — licensing forbids that. We call the API, render the route ourselves |

Weather, soil, and forest-health stats live in a **side panel keyed to the selected observation or map-tap location**, not as map overlays — foresters need numbers more than gradients.

**Offline note**: raster WMS overlays are heavy. Cache budget per user is ~200 MB. BayernAtlas layers only cached for regions the user explicitly "downloads for offline."

## Design system

All colors, typography, spacing, and component rules live in [DESIGN.md](stitch_smart_forest_tracker/forest_management_system/DESIGN.md). Key tokens:

- `primary` `#173124` (Forest Green) — structural
- `tertiary-fixed-dim` `#ffb693` / accent `#FF6B00` (Safety Orange) — primary CTAs, critical alerts
- `secondary` `#765840` (Earthy Brown) — organic data, monitoring status
- `error` `#ba1a1a` — critical priority only
- Touch target: `3rem` (48px) minimum
- Font: Public Sans
- Corner radius: 4px base, 8px on large containers

Priority → color mapping is fixed:
- Critical → Safety Orange / `#ba1a1a` error red
- Monitoring / Medium → Earthy Brown / `tertiary`
- Stable / Low → Forest Green / `primary-container`

## Conventions (once code exists)

- TypeScript strict mode. No `any` in shipped code.
- Components live in `src/components/<Domain>/`. Screens in `src/screens/`.
- Data access is never direct to Supabase from components — goes through a repository layer in `src/data/` that reads/writes IndexedDB first, then queues remote sync.
- All user-visible strings pass through an i18n layer from day one. Primary languages: German (de), English (en). Unterreiner is a German operation.
- Coordinates stored as `{ lat, lng }` numbers (WGS84 / EPSG:4326). Display in degrees decimal; compute distances in meters.
- Timestamps are UTC ISO strings in storage; format for display in the user's local timezone.

## Navigation & UX structure

- **Splash** at `/` — Waldblick wordmark + forest icon, auto-navigates to Map after 1.4s (tap to skip).
- **Auth routes** (public): `/signin`, `/signup`, `/forgot-password`, `/reset-password`. Wraps the whole authenticated surface via `AuthGuard`. Demo mode bypasses auth when Supabase env is unset.
- **Bottom nav (5 slots, authenticated)**: `Map · Tasks · Record (centered FAB, raised) · Messages · Dashboard`. Sub-pages (Observation detail, Profile, Settings, Connect, Conversation, Record form) hide the nav in favor of their own back/action bars.
- **Top bar (all screens)**: title · trailing slot · **Notification bell** (dropdown) · **Profile avatar** (dropdown → Profile, Connect user, Settings, Sign out).
- **Connect** lives at `/connect`, reached primarily from the Messages screen header and secondarily from the profile-avatar dropdown. Not a nav slot.

## What lives where

- **Design tokens, component rules** → `stitch_smart_forest_tracker/forest_management_system/DESIGN.md`
- **Visual reference for each screen** → `stitch_smart_forest_tracker/<screen>/code.html` and `screen.png`
- **How to do common things** → [playbook.md](playbook.md)
- **What to build next** → [implementation-plan.md](implementation-plan.md)

## Things that are easy to get wrong

- Don't treat the Stitch HTML as a component spec. It's a visual target. Several inline `tailwind.config` blocks override the real design tokens (e.g. `borderRadius.DEFAULT` is `0.125rem` in mockups but `0.25rem` in DESIGN.md). Trust `DESIGN.md`.
- Don't build the map view as the first screen. The "add observation" flow is the core loop; if that's painful, nothing else matters.
- Don't require login to capture an observation. Queue it locally and associate it to a user once they authenticate. Field workers will skip the app otherwise.
- Don't send photos straight to remote storage on submit. Store locally, sync when on wifi / signal. Spruce-forest 4G is unreliable.
