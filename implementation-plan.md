# Implementation Plan

How we get from static mockups to a working field tool. Read [CLAUDE.md](CLAUDE.md) for the product concept and constraints.

## Locked decisions

### 1. Platform: PWA first (iOS + Android), native later

**v1: PWA.** React + Vite + TypeScript, installable via "Add to Home Screen" on both iOS Safari and Android Chrome. Service-worker offline. One codebase, one deploy, no app-store review.

**v2: native wrapper.** Once field UX is validated and we need background GPS, push notifications with rich actions, or deeper camera control, wrap the PWA in Capacitor (preferred) or rewrite in React Native. Capacitor lets us reuse ~100% of the PWA code and progressively swap web APIs for native plugins (camera, geolocation, filesystem) where measurably better.

| | PWA (v1) | Capacitor wrap (v2) | Full React Native (v2 alt) |
|---|---|---|---|
| Code reuse from v1 | — | ~100% | ~60% (logic only) |
| Background GPS | No | Yes (plugin) | Yes |
| Push notifications | Limited on iOS | Yes | Yes |
| App store distribution | No | Yes | Yes |
| Rebuild cost | — | Low | High |

The v2 trigger is real field feedback, not a calendar date. If the PWA covers the four scenarios in CLAUDE.md, we may never need v2.

### 2. Backend: Supabase

Postgres + auth + storage + realtime + edge functions in one managed service. Row-level security gives us multi-tenant forest separation for free. Realtime channels give multi-user map updates without custom infra.

**Alternative:** Firebase (NoSQL — worse for our relational data). **Alternative:** self-hosted Postgres + Fastify (more work, not justified for v1).

### 3. Map: MapLibre GL JS as single canvas, multi-source

See the stacked-sources table in [CLAUDE.md](CLAUDE.md). Specifics:

**Base layers** (user switches one at a time via layer panel):
- ESRI World Imagery satellite — zoomed-in canopy detail.
- **DTK25** (Topographische Karte 1:25 000) — classic topo with forest roads, contour lines, named features. BayernAtlas WMS. Layer group: `by_dtk25`. Endpoint TBD — listed in source material as `https://bayern.de?`, resolve via [Geoportal Bayern](https://geoportal.bayern.de) service catalog.
- **DTK500** — overview. `https://geoservices.bayern.de/od/wms/dtk/v1/dtk500?` · layers `by_dtk500` (color) or `by_dtk500_grau` (grayscale, better for overlay readability).
- **DOK** digital topo — `https://geoservices.bayern.de/od/wms/dtk/v1/dok?`.

**Cadastral overlays** (BayernAtlas WMS — free, attribution required, open data):
- **ALKIS Parzellarkarte** — parcel boundaries. `https://geoservices.bayern.de/od/wms/alkis/v1/parzellarkarte?` · layer `by_parzellarkarte`. **Answers "which forest is mine."**
- **ALKIS Tatsächliche Nutzung** — actual land use classification per parcel. `https://geoservices.bayern.de/od/wms/alkis/v1/tn?`. Distinguishes Wald / Grünland / Verkehrsfläche — useful for reforestation planning and contractor scoping.
- Admin boundary layers (from the Parzellarkarte or ALKIS boundary service): `by_alkis_gmd_komplett` (municipality), `by_alkis_kreis_komplett` (county), `by_alkis_land_komplett` (state). Shown as thin lines on the overview zoom.

**Environmental overlays** (LfU WMS — free, attribution required):
- **Bodenübersichtskarte 1:200 000** — soil overview. `https://www.lfu.bayern.de/gdi/wms/boden/buek200by?`. Broad soil classes.
- **Übersichtsbodenkarte 1:25 000** — detailed soil map. `https://www.lfu.bayern.de/gdi/wms/boden/uebk25?`. **Drives reforestation species recommendations** (scenario #3).
- **Hydrogeologische Karte 1:100 000** — groundwater / aquifer / permeability. `https://www.lfu.bayern.de/gdi/wms/geologie/hk100?`. Useful for erosion risk after storm events (scenario context for washouts).

**Forest-specific** (to validate):
- Forstliche Standortskarte (forest site map) and Waldfunktionskarte (forest function classification) — published by StMELF / LWF, likely discoverable via Geoportal Bayern. Check in Phase 2; if available adds species/site matching to reforestation planning.

**Routing**:
- **Google Directions API** — we call the API, receive polyline, render on MapLibre as a line layer. Google Maps tile rendering inside MapLibre is forbidden by Google's ToS; routing data is fine. Alternatives if cost is a concern: GraphHopper Directions, OSRM (self-hostable, free).

**Weather + live forest data** (side panel, not map overlay):
- Bright Sky (free DWD wrapper) — current conditions + 3-day forecast at the observation's coords.
- Copernicus Sentinel-2 — recent canopy imagery tile, refreshed ~5 days, useful for detecting new beetle damage or windthrow between visits. Fetched on-demand per observation, not as a base layer.

**Offline trade-off**: WMS is raster, heavier than vector. Cache policy:
- Basemap tiles: stale-while-revalidate, 150 MB cap.
- BayernAtlas overlays: only cached when user explicitly "download area for offline." 50 MB cap per downloaded area.
- Our GeoJSON (observations, plots): always offline via Dexie.

**Legal checklist before Phase 2**:
- BayernAtlas layer licenses — most are open data with attribution, some need a free API key. Each used layer documented in `src/map/layers.ts` with its license string.
- Google Directions API — billable per request. Budget + usage-cap alerts in GCP console. Free tier ($200/mo) covers early use.
- ESRI World Imagery — free for non-commercial; check commercial terms before pilot with a paying forest owner.

### 4. Local storage: Dexie.js

Thin typed IndexedDB wrapper. Clean schema migrations. `idb` from jakearchibald is the lower-level alternative; we'd lose migration ergonomics.

## Data model (v1)

```sql
-- Supabase / Postgres
users            (id, email, name, role, created_at)
forests          (id, name, owner_id, boundary geography(POLYGON))
plots            (id, forest_id, name, boundary geography(POLYGON))
observations     (id, forest_id, plot_id NULL, author_id, category, priority,
                  status, description, lat, lng, captured_at, created_at, updated_at,
                  deleted_at NULL)
observation_photos (id, observation_id, storage_path, width, height, captured_at)
tasks            (id, observation_id, assignee_id, due_at, completed_at NULL)
sync_ops         (local-only, Dexie) -- queue of pending writes
```

RLS policies: a user sees rows where `forest_id` is in their membership. Simplifies to "show me my forest".

`category` enum: `beetle | thinning | reforestation | windthrow | erosion | machine | other`
`priority` enum: `critical | medium | low` (starts user-picked; auto-derived in Phase 4)
`status` enum: `open | in_progress | resolved`

## Phased build

Phases are sequenced so each ends in something demoable. Ship what works; defer what doesn't.

### Phase 0 — Foundations (½ day)

- `npm init` Vite + React + TS project at repo root.
- Wire Tailwind with the design tokens from `DESIGN.md`. Import Public Sans and Material Symbols.
- Set up ESLint, Prettier, Vitest.
- Create empty folders: `src/{screens,components,data,domain,i18n}`.
- Create Supabase project. Commit `.env.example`. Add `@supabase/supabase-js`.
- Service worker registration (empty).

Done when: `npm run dev` shows a blank screen using the correct fonts and primary color.

### Phase 1 — Core capture loop (2 days)

The one flow that must work beautifully: *open app → tap Record → take photo → description → priority → submit*.

- Auth: **email + password** via Supabase (sign in / sign up / forgot / reset). Demo-mode bypass when env unset, so local dev is never blocked.
- `AddObservation.tsx` — matches `add_documentation/code.html`. Camera capture via `<input type="file" accept="image/*" capture="environment">`. GPS via `navigator.geolocation.getCurrentPosition`.
- `observationRepo.ts` — writes to Dexie immediately, queues a `sync_op`, returns observation id.
- `ObservationDetails.tsx` — matches `observation_details/code.html`, renders from Dexie.
- `TaskList.tsx` — matches `task_list/code.html`. Real filter state: priority / category (checkboxes in bottom sheet), date range (all / today / 7d / 30d), proximity toggle (sorts by distance from current GPS).
- 5-slot bottom nav wired — Map · Tasks · **Record FAB (centered, raised)** · Messages · Dashboard. Profile + Notifications live top-right on every screen.

Done when: on a real phone, user can capture 5 observations offline, filter them in the task list, open each for detail. No map yet.

### Phase 2 — Map view + layered sources (2.5 days) ✅ COMPLETE

- `MapScreen.tsx` — MapLibre full-screen with ESRI World Imagery basemap.
- **Observation markers** from Dexie as a GeoJSON source; teardrops colored by priority (see `DESIGN.md`). Tap marker → bottom sheet with title, photo thumb, "View details".
- **Plot boundaries** rendered from `plots` GeoJSON as a filled polygon layer, toggleable.
- **Layer panel** (slide-in from the right): on/off toggles for — Satellite, Cadastral (BayernAtlas ALKIS), Forest sites (BayernAtlas Standortskarte), Plots, Observations. State persisted per user.
- **BayernAtlas WMS integration**: validate endpoint + layer names against the live service. Add as MapLibre `raster` sources. Attribution strings rendered in map corner.
- **Directions**: long-press any point → "Get directions from current location". Call Google Directions API, render response polyline on MapLibre, show distance/ETA in a bottom card. Feature-flag so we can disable if billing worries.
- **Weather + site panel**: right-side drawer shown when an observation is open. Calls Bright Sky for current + 3-day forecast at the observation's coords. Copernicus thumbnail if available.
- Current-location dot + recenter button.
- Top filter chips: priority, category, date range (same model as task list).
- Dashboard screen (`high_contrast_grid_map/code.html`) split-view for tablet/desktop — map left, stats card right. Mobile reuses the full-screen map.

Done when: on a real phone, user sees their observations and plot boundaries over satellite, can toggle BayernAtlas cadastral on to see parcel edges, can long-press to get driving directions, and can open the weather panel for any observation.

### Phase 3 — Offline + sync (2 days) ✅ COMPLETE

This is where most products fail. Budget accordingly.

- Workbox service worker. Precache app shell. Runtime-cache MapLibre tiles with stale-while-revalidate and a 200 MB cap.
- Manual "Download this area" action on the map: user draws a rect, we fetch and pin tiles at zoom 12–16.
- Sync engine: on `online` event and on app foreground, drain `sync_ops` queue. For each op: upload photo blob to Supabase Storage, write observation row. On success, delete sync_op. On conflict, keep local pending and surface in a "Sync issues" panel.
- Realtime subscription on `observations` table. Incoming changes merge into Dexie. Conflict resolution: newer `updated_at` wins per field. Soft deletes respected.
- Photo pipeline: client-side resize to 1600px long edge, JPEG 0.82. Strip EXIF but keep GPS lat/lng into the observation record explicitly.

Done when: phone in airplane mode captures 10 observations including photos, returns online, all sync without user action, and another phone sees them live on the map.

### Phase 4 — Prioritization + coordination + species recommendations (2.5 days)

- **Auto-priority**: compute on server via a Postgres trigger. Inputs: category (beetle/erosion default to critical), proximity to other criticals (within 50m raises medium→critical), age (unresolved critical >48h stays critical; adds `stale` flag).
- **Task assignment**: from observation detail, "Assign" picker with forest members. Assignee sees it in their task list filter "Assigned to me".
- **Species recommendation (scenario #3, first-class)**: for reforestation observations, query the LfU soil WMS `GetFeatureInfo` endpoint at the observation's coords (ÜBK25 preferred, BÜK200 fallback), parse the soil class (e.g. "Braunerde über Kalkstein", "Pseudogley"), join against a curated soil→species matrix in `src/domain/species.ts`, and show on the detail screen a ranked list of recommended species with confidence and contraindications ("Fichte: geeignet, aber Borkenkäferrisiko bei Monokultur"). Matrix is plain data — editable by domain experts without code changes. Results cached per parcel in Dexie so the recommendation still works offline after first fetch.
- **Machine positions (scenario #4)**: a lightweight `machines` table with last-known lat/lng updated every 30s while a machine's app session is open. Render as distinct icons on the map. Deferrable to v1.1 if time-pressed.

Done when: creating a beetle observation auto-flags it critical; creating a reforestation observation shows the top 3 species recommendations with soil-class rationale; assigning a task moves it to the contractor's list.

### Phase 4.5 — Messaging, connections, notifications (2 days)

Turns the tool from a single-user logger into a coordination platform.

- **Data model** (Supabase):
  - `connections` (`requester_id`, `addressee_id`, `status: pending|accepted|blocked`, `invite_code` unique). Accepted connections unlock messaging + cross-org task assignment.
  - `conversations` (`id`, `participant_a`, `participant_b`, `last_message_at`). 1:1 only in v1.
  - `messages` (`id`, `conversation_id`, `author_id`, `body`, `observation_id` nullable, `created_at`). Realtime channel per conversation.
  - `notifications` (`id`, `user_id`, `kind`, `title`, `body`, `target_path`, `read`, `created_at`). Fanned out by Postgres triggers for critical observations, task assignment, incoming messages, connection requests.
- **Connect flow**: each user has a short `invite_code` (derived from user id + name hash). The `/connect` screen shows your code + input to enter someone else's. Accepting creates a `connections` row and opens a default conversation.
- **Messaging**: `/messages` lists conversations (sorted by `last_message_at`, unread badge). `/messages/:id` is a per-conversation chat with realtime subscribe on the `messages` channel. Pending-send behavior identical to observations: write to Dexie first, queue `sync_op`, mark the message `pending` in UI.
- **Observation deep-link in chat**: long-press an observation in the list or detail screen → "Share to chat" → picks a conversation → message is created with `observation_id` set. Recipient sees a photo thumbnail and a tap-through.
- **Notifications**: top-bar bell dropdown reads from `notifications` table for the current user. Realtime channel. Unread count → badge. Tapping a row marks read and navigates to `target_path`. Push notifications arrive in v2 (Capacitor wrap).

Done when: user A sends an invite code to user B; B accepts; A and B can message each other; a critical observation by A surfaces as a notification to B if they're in the same forest; tapping the notification deep-links to the observation.

### Phase 5 — Polish before demo (1 day)

- German translation pass (Unterreiner is German-speaking).
- Empty states for every list.
- One real manual field test: take a phone to a park with mixed 4G, capture 5 observations across dead zones, come back, confirm all synced.
- Loading skeletons matching the header-strip card style.
- Error toasts in Safety Orange, dismissable.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| iOS Safari service worker quirks break offline | Medium | Test on real iOS device by end of Phase 1, not Phase 3 |
| Supabase RLS misconfiguration leaks other forests' data | High impact | RLS policy tests in Phase 1. Explicit `select` policies, never rely on column filters |
| Photo uploads eat user data plans | Medium | Client-side resize, default upload only on wifi |
| GPS accuracy under canopy (±30m) frustrates users | High | Show accuracy radius on the map. Let users drag the pin to correct before submit |
| Map tiles cost explodes | Low | MapLibre + ESRI/BayernAtlas is free. Only risk if we swap to Mapbox |
| BayernAtlas WMS changes URL or adds auth | Medium | Keep endpoints + layer names in `src/map/layers.ts`, easy to swap. Fallback: no overlays, satellite only |
| Google Directions API bill spikes | Medium | GCP usage cap + alerts. Cache recent routes in IndexedDB keyed on origin/dest. Feature-flag the feature for kill switch |
| BayernAtlas only covers Bavaria, other German states unsupported | Low for pilot | Unterreiner is Bavarian; scope to Bayern for v1. For other states use that state's geoportal (LANUV NRW, LGL BW, etc.) via the same WMS layer interface |
| Tokens in `DESIGN.md` drift from the HTML mockups' inline config | Certain | Playbook rule: `DESIGN.md` is the source of truth |

## Field test checklist (run before every demo)

1. Airplane mode. Capture observation with photo. Confirm stored.
2. Reload app offline. Confirm observation visible on map and in task list.
3. Capture 4 more offline. Reload. Confirm all five present.
4. Go online. Watch sync drain. Confirm rows appear in Supabase dashboard.
5. On a second device (different account in the same forest), open the map. Capture one observation. Confirm it appears on device 1's map within 5s.
6. Delete an observation on device 2. Confirm it disappears on device 1.
7. Throttle network to Slow 3G. Capture observation with photo. Confirm it doesn't block the UI.

## Out of scope for v1

- Drawing plot boundaries in the app (admins seed in Supabase).
- Push notifications for new critical observations (nice to have; needs APNs/FCM setup).
- Offline tile pre-packaging of entire regions — only manual rect download.
- Integration with forestry ERP systems.
- Rich text or voice notes in description (plain text only).
- Live machine positions (scenario #4) if Phase 4 time-pressed.

These are tracked, not abandoned. Revisit after v1 ships.
