# Playbook

Common workflows for working on Waldblick. Read [CLAUDE.md](CLAUDE.md) first.

## Preview a mockup

The four HTML files in `stitch_smart_forest_tracker/*/code.html` are self-contained — open them directly in a browser, or serve the folder:

```
cd stitch_smart_forest_tracker && python3 -m http.server 8000
# then visit http://localhost:8000/high_contrast_grid_map/code.html
```

Use the corresponding `screen.png` for the designer's intended rendering — the Tailwind CDN occasionally lags, and the PNG is what the reviewer sees.

## Before touching visuals

1. Open [DESIGN.md](stitch_smart_forest_tracker/forest_management_system/DESIGN.md). Use the named tokens (`primary`, `tertiary-fixed-dim`, `stack-md`, etc.) — never hardcode hex or rem values.
2. Only invent a new token if the existing set genuinely can't express the need. Then add it to `DESIGN.md` in the same change.
3. Verify contrast against the background in `DESIGN.md` (Bone `#F7F9F7`). WCAG AA is required.

## Adding a new screen

1. Sketch in HTML first in `stitch_smart_forest_tracker/<new_screen>/` matching the four existing mockups' structure. This keeps designer review fast and avoids rebuilding in code you'll throw away.
2. Share the mockup. Once approved, port to a React component in `src/screens/<NewScreen>.tsx`.
3. Reuse existing components from `src/components/` — the design system has teardrop markers, header-strip data cards, coordinate overlays, status badges. Don't duplicate.
4. Wire the route in `src/App.tsx`. Add it to the bottom-nav only if it's a top-level destination; otherwise it's a push from an existing screen.

## Adding a field to Observation

Any schema change needs to flow through all four layers. Skipping one breaks sync.

1. **DB** — add column to `observations` table in Supabase (migration file in `supabase/migrations/`).
2. **Type** — update `Observation` interface in `src/data/types.ts`.
3. **Local store** — bump Dexie schema version in `src/data/db.ts` and add an upgrader.
4. **Repository** — include the field in `observationRepo.create/update/get`.
5. **UI** — add the input to `AddObservation.tsx` and the read view to `ObservationDetails.tsx`.
6. **i18n** — add label strings in `src/i18n/de.json` and `src/i18n/en.json`.

If the field is optional in existing records, the Dexie upgrader and SQL migration must both handle `NULL` gracefully.

## Adding a map marker type

Markers are keyed by `Observation.category`. To add a new category (e.g. "windthrow"):

1. Add to the `Category` union in `src/data/types.ts`.
2. Pick a color from the design palette — don't invent. The four taken colors are error red (critical/beetle), tertiary (monitoring), primary (stable), secondary (organic). If all mappings feel wrong, reopen the color choice in DESIGN.md with the designer.
3. Add the Material Symbols icon name in `src/components/Map/markerConfig.ts`.
4. Add the category as a filter chip on the task list and map filter drawer.

## Working offline

- Any repository call must succeed when offline. Reads come from Dexie. Writes go to Dexie and enqueue a `sync_op` row.
- The service worker (Workbox) caches the app shell and recent map tiles. Never bypass it for app assets.
- Test offline by opening Chrome DevTools → Application → Service Workers → Offline. Capture an observation, reload, confirm it's still there, then go online and watch it sync.

## Handling photos

- Store locally in IndexedDB as a `Blob` keyed by observation ID.
- On sync, upload to Supabase Storage bucket `observation-photos`, then replace the local blob URL with the storage URL in the observation row.
- Never submit the form with an unresized image — downscale to 1600px longest edge, JPEG quality 0.82, client-side before store. Field phones have small data plans.

## Prioritization logic

The spec says "automatic prioritization." Today, priority is user-selected. Automatic ranking (planned) combines:

- Category weight (beetle = high, reforestation-check = low).
- Proximity to other critical observations (clustered critical = escalate).
- Age (unresolved critical older than 48h → escalate and notify).

All weights live in `src/domain/priority.ts` as plain constants. Change them in one place.

## Testing

- Unit tests for pure domain logic (priority scoring, distance calc, conflict resolution) — Vitest.
- Component tests for screens — React Testing Library, mock the repository layer.
- No test that hits real Supabase. Stand up a local Supabase instance or mock the client.
- Manual field test checklist lives in [implementation-plan.md](implementation-plan.md) — run it on a real phone before any demo.

## Shipping a change

1. Run `npm run typecheck && npm run lint && npm run test`.
2. Preview on a phone (not just desktop responsive mode) — target: iPhone SE size, Android mid-range Chrome.
3. If the change touches the offline path, run the offline test above before merging.
4. Commit with a message that says *why*. PR descriptions should reference the scenario (1–4 in CLAUDE.md) the change serves.

## Adding a notification type

Notifications flow from server triggers → Supabase Realtime → the top-bar bell.

1. Extend `NotificationKind` in `src/data/types.ts` with the new kind (e.g. `'weather_warning'`).
2. Add an icon + accent-color mapping in `src/components/Layout/NotificationBell.tsx` (`ICON_FOR`, `ACCENT_FOR`).
3. Add i18n strings for default title/body templates in `de.json` + `en.json`.
4. Create a Postgres trigger in `supabase/migrations/` that inserts a row into `notifications` when the source condition fires (e.g. new critical observation within the user's forest). Include `target_path` so taps deep-link correctly.
5. Subscribe to the row via Realtime in the bell component (Phase 4.5 wires this once) — no code change per new kind.

## Adding a contact / connection

Connections are invite-code based, not email-search, because field workers know each other by crew, not address.

1. Server: the `connections` table has `status` `pending | accepted | blocked`. Writing to it from the client needs RLS that allows either participant to update.
2. Client: `/connect` screen shows your code + input. On submit, insert a `connections` row with status `pending`. The other user sees a `connection_request` notification.
3. Accepting creates a mirror row if needed and opens a conversation.

## When stuck

- Visual decisions → re-read `DESIGN.md`, look at the four screen PNGs for reference.
- Domain decisions → re-read the four scenarios in [CLAUDE.md](CLAUDE.md). If a choice breaks one, it's the wrong choice.
- Architecture decisions → [implementation-plan.md](implementation-plan.md) records the ones already made and why.
