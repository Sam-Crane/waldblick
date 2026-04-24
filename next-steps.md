# Next steps

The six phases (0–5) from [implementation-plan.md](implementation-plan.md) are complete. What's left to do, in the order it unlocks the most value.

## Immediate — blocks the first real demo

These are the minimum steps between the current repo state and running the [field-test checklist](playbook.md) on a phone.

1. **Apply the remaining Supabase migrations** in order, via the SQL editor:
   - `supabase/migrations/0003_machines.sql`
   - `supabase/migrations/0004_messaging_notifications.sql`
   - `supabase/migrations/0005_discovery_and_profile_autocreate.sql` *(fixes the missing invite code, opens user discovery, fans out "new user joined" notifications)*
   - `supabase/migrations/0006_fix_trigger_security.sql` *(fixes 403 on connection/message inserts — the fanout triggers needed SECURITY DEFINER — plus explicit search_path on every function to satisfy the linter)*
   - `supabase/migrations/0007_tighten_rls.sql` *(closes two cross-user leaks: observations/photos/machines with `forest_id IS NULL` are now author-only, and the tasks table's blanket FOR ALL policy is split into assignee/author-only INSERT/UPDATE/DELETE/SELECT)*
2. **Seed a forest** by running `supabase/seeds/demo_forest.sql`. Single-owner by default — only the oldest profile becomes a member, so no cross-user visibility. For the multi-user coordination demo (everyone in one forest), also run `supabase/seeds/demo_forest_multi.sql` — deliberate privacy loosening, don't run on a prod project.
3. **Turn on leaked-password protection** in Supabase Auth → Password Security → enable HaveIBeenPwned. One-click, blocks sign-ups with compromised passwords.
4. **PWA icons already generated** — `public/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, plus `apple-touch-icon.png` and `favicon-32.png`. Regenerate any time by editing `public/icon.svg` / `public/icon-maskable.svg` and running `npm run icons`.
5. **Run the field test checklist** from [playbook.md](playbook.md). Fix any blockers found.

## Short-horizon — polish that pays off for the demo

Roughly half a day each, nice to have before showing to Unterreiner.

### Plot polygon drawing tool *(deferred from Phase 2)*
Right now plots are seeded as mocks. Add a minimal admin flow:
- New screen at `/plots` reachable from the Settings screen.
- MapLibre `maplibre-gl-draw` plugin for polygon drawing.
- On save, write to `public.plots` — table + RLS already exist.
- List view showing existing plots with edit + delete.

Alternative shortcut: have admins hand-craft polygons in [geojson.io](https://geojson.io/) and paste the raw GeoJSON into a textarea field. Ships in an hour.

### Supabase Edge Function for Directions (optional hardening)
Move the Google Directions call out of the browser into a Supabase Edge Function so the API key stays server-side. Removes the need for HTTP-referrer restrictions and stops users from seeing the key in DevTools.

### Real-phone installability polish
- Ensure the manifest `start_url` + theme colors render correctly once installed.
- Double-check iOS splash screens (per-device sizes live under `public/splash-*`).
- Test "Add to Home Screen" in Safari on iOS + Chrome on Android.

## Medium-horizon — production hardening

### Copernicus Sentinel-2 in-app imagery *(deferred from Phase 2)*
Currently we link out to the Copernicus Browser. For in-app preview:
- Sign up for Copernicus Data Space OAuth client.
- Add a Supabase Edge Function that proxies auth'd tile requests so the client-id/secret never touch the browser.
- Render a fresh cloud-free S2 tile under the observation photo with date stamp.
- Estimated: 1–1.5 days.

### Machine trail history *(scoped out of Phase 4)*
Machines currently show only last-known position. Add a `machine_positions` table that stores every ping (with a short retention) and draw a fading trail behind each machine on the map.

### Per-user notification preferences
Users can turn off `user_joined` / `message` / etc. kinds from Settings. Stored as a `notification_prefs` jsonb on profiles. Applied server-side in the trigger functions before insert.

## Long-horizon — v2: native wrap

When the PWA field UX is validated and you hit the first feature you can't do on the web, wrap in Capacitor:

1. `npx cap init waldblick de.unterreiner.waldblick` (iOS + Android).
2. Reuse ~100% of the web code; progressively swap web APIs for native plugins:
   - `@capacitor/geolocation` for background GPS (enables machine tracking while screen is locked).
   - `@capacitor/camera` for deeper camera control.
   - `@capacitor/push-notifications` + FCM/APNs for real push (replaces in-app bell for critical alerts).
3. Submit to App Store + Play Store with a basic screenshot set + privacy manifest.

Estimated: 3–5 days for a basic wrap, another week for store review + polish.

## Deferred features — tracked but not planned

- Group chat (currently 1:1 only).
- Rich text or voice notes in observations.
- Integration with external forestry ERP systems.
- Drawn plot boundaries from the mobile app (admin panel comes first).
- Full offline tile pre-packaging for regions (currently rect-based on-demand).
- Row-level encryption for very-sensitive observations.

## Risk register — things to watch during demo prep

| Risk | Impact | Mitigation |
|---|---|---|
| A tester signs in and the Discover list is empty | Confusing UX | Seed 2–3 demo user accounts before the demo |
| iOS Safari denies precise geolocation | Markers appear in wrong place | Walk testers through "Precise Location: On" in Settings once |
| BayernAtlas WMS outage | Overlays fail silently | Already handled — base layer still renders |
| Supabase free-tier cold-start latency | First sign-in feels slow | Pre-warm by hitting the project before the demo |
| PWA install prompt not showing | Testers use browser tab, lose the app feel | Ensure HTTPS + all three icon PNGs + `start_url` correct |
