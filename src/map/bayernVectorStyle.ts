import type { StyleSpecification } from 'maplibre-gl';

// Mapbox-GL style document for the BayernAtlas web_vektor_by vector
// basemap. The TileJSON we fetched
//   https://services.atlas.bayern.de/vt/tiles/web_vektor_by.json
// is the *data* manifest only — it tells us where the .pbf tiles live
// and what vector source-layers exist, but no styling rules. We have
// to write the rendering ourselves. (atlas.bayern.de loads its own
// proprietary style document on top of this same source.)
//
// Source-layer IDs are taken verbatim from the TileJSON's
// `vector_layers[].id`. Spelling matches LDBV's German-language schema:
//   Hintergrund, Vegetationsflaeche, Gewaesserflaeche, Verkehrslinie,
//   Gebaeudeflaeche, Grenze_Linie, Siedlungsflaeche, Name_Punkt, etc.
//
// Most layers have a `klasse` (subtype) field that BayernAtlas uses to
// stratify roads/water/vegetation by type — we'd want to filter on that
// for proper hierarchical styling (highway thicker than footpath, etc).
// For v1 we render everything in a single class with subtle Forest-Green
// / Earthy-Brown palette tuned for forestry, deferring per-klasse rules
// until users tell us specific things they want emphasised.

const TILES = [
  'https://vt1.bayernwolke.de/tiles/web_vektor_by/{z}/{x}/{y}.pbf',
  'https://vt2.bayernwolke.de/tiles/web_vektor_by/{z}/{x}/{y}.pbf',
  'https://vt3.bayernwolke.de/tiles/web_vektor_by/{z}/{x}/{y}.pbf',
];

const SOURCE_ID = 'bayern-vector';

// Forest-themed palette. Lighter than the BayernAtlas default styling
// because we expect the user to overlay observations + plot boundaries
// on top — too saturated a basemap drowns those out.
const COLORS = {
  background: '#f3eee2', // warm cream
  vegetation: '#cfdcb3', // soft sage (forest areas)
  water: '#b6cfe5', // muted blue
  settlement: '#e6ddd0', // sandy beige
  building: '#c7b9a3',
  buildingOutline: '#8b7d68',
  road: '#ffffff',
  roadCasing: '#9c8f78',
  border: '#765840', // earthy brown — DESIGN.md
  text: '#173124', // forest green — DESIGN.md
  textHalo: '#ffffff',
};

export function buildBayernVectorStyle(): StyleSpecification {
  return {
    version: 8,
    // MapLibre needs a glyphs URL to render text. The demotiles host is
    // free and serves a Noto-Sans-flavoured font set we use elsewhere.
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      [SOURCE_ID]: {
        type: 'vector',
        tiles: TILES,
        minzoom: 5,
        maxzoom: 15,
        attribution: '© Bayerische Vermessungsverwaltung (LDBV) — BayernAtlas',
      },
    },
    layers: [
      // Background — solid colour fill behind everything else.
      { id: 'bv-background', type: 'background', paint: { 'background-color': COLORS.background } },

      // Vegetation areas (forests, parks) — render first so other features
      // sit on top. The "art"/"klasse" fields could discriminate between
      // forest / orchard / park / etc, but a single fill reads well.
      {
        id: 'bv-vegetation',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': 'Vegetationsflaeche',
        paint: { 'fill-color': COLORS.vegetation, 'fill-opacity': 0.65 },
      },

      // Water bodies (Gewaesser = waters: rivers, lakes, ponds).
      {
        id: 'bv-water-fill',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': 'Gewaesserflaeche',
        paint: { 'fill-color': COLORS.water },
      },
      {
        id: 'bv-water-line',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': 'Gewaesserlinie',
        minzoom: 8,
        paint: { 'line-color': COLORS.water, 'line-width': 1.2 },
      },

      // Settlement areas — flat sandy fill, sits between vegetation
      // and buildings/roads.
      {
        id: 'bv-settlement',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': 'Siedlungsflaeche',
        paint: { 'fill-color': COLORS.settlement, 'fill-opacity': 0.6 },
      },

      // Buildings.
      {
        id: 'bv-buildings',
        type: 'fill',
        source: SOURCE_ID,
        'source-layer': 'Gebaeudeflaeche',
        minzoom: 13,
        paint: {
          'fill-color': COLORS.building,
          'fill-outline-color': COLORS.buildingOutline,
        },
      },

      // Roads — two-pass casing + line so they read at every zoom.
      {
        id: 'bv-road-casing',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': 'Verkehrslinie',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLORS.roadCasing,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 12, 1.6, 16, 4],
        },
      },
      {
        id: 'bv-road-fill',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': 'Verkehrslinie',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': COLORS.road,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0, 12, 0.6, 16, 2.5],
        },
      },

      // Administrative borders — earthy-brown dashed line.
      {
        id: 'bv-border',
        type: 'line',
        source: SOURCE_ID,
        'source-layer': 'Grenze_Linie',
        paint: {
          'line-color': COLORS.border,
          'line-width': 1,
          'line-dasharray': [4, 2],
          'line-opacity': 0.6,
        },
      },

      // Place labels (Name_Punkt). MapLibre needs `text-font` whose
      // names match what the glyphs server supplies — we use the
      // generic "Open Sans Regular" stack from demotiles, which the
      // free server resolves to its bundled Noto fallback.
      {
        id: 'bv-place-labels',
        type: 'symbol',
        source: SOURCE_ID,
        'source-layer': 'Name_Punkt',
        minzoom: 8,
        layout: {
          'text-field': ['coalesce', ['get', 'name'], ['get', 'name_kurz']],
          'text-font': ['Open Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10, 14, 14],
          'text-allow-overlap': false,
          'text-letter-spacing': 0.05,
        },
        paint: {
          'text-color': COLORS.text,
          'text-halo-color': COLORS.textHalo,
          'text-halo-width': 1.5,
        },
      },
    ],
  };
}
