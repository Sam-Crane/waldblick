# Waldblick

Smart Forest Tracker — a mobile-first PWA for forest owners, foresters, and contractors. Capture geotagged photo observations in the field, share them on a map, and coordinate work by urgency.

Start with [CLAUDE.md](CLAUDE.md) for the product concept and stack, [playbook.md](playbook.md) for common workflows, and [implementation-plan.md](implementation-plan.md) for the phased build.

## Getting started

```bash
cp .env.example .env   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY once Supabase is provisioned
npm install
npm run dev            # http://localhost:5173
```

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — typecheck + production build
- `npm run preview` — preview the built bundle (serve to a phone on the same network via the printed LAN URL)
- `npm run typecheck` — TS only
- `npm run lint` — ESLint
- `npm run test` — Vitest
- `npm run format` — Prettier write

## Layout

```
src/
  components/    reusable UI (AppShell, BottomNav, TopBar, PriorityBadge)
  screens/       route-level screens (Map, AddObservation, TaskList, ObservationDetails)
  data/          types, Dexie DB, Supabase client, repositories
  domain/        pure logic — priority, species matrix, geo helpers
  map/           layer definitions (BayernAtlas + LfU + satellite)
  i18n/          de.json + en.json, runtime dictionary
  test/          Vitest setup
stitch_smart_forest_tracker/
  forest_management_system/DESIGN.md   design system source of truth
  <screen>/code.html + screen.png      visual targets
```
