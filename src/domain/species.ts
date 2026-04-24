// Soil → species recommendation matrix for scenario #3 (reforestation).
// Driven by LfU ÜBK25 / BÜK200 soil-class lookup at the observation coordinate.
// Editable by domain experts; no code changes required to tune recommendations.
//
// Confidence scale: 0.0–1.0. Contraindications are human-readable, shown in the UI.
// Matrix is intentionally small and curated — expand with forester input, not guesswork.

export type SpeciesRecommendation = {
  species: string; // German common name; UI may translate via i18n
  latin: string;
  confidence: number;
  contraindications?: string[];
};

export type SoilProfile = {
  // Values returned by LfU WMS GetFeatureInfo. Key fields vary by layer; normalize to this shape.
  soilClass: string; // e.g. "Braunerde", "Pseudogley", "Parabraunerde"
  substrate?: string; // e.g. "Kalkstein", "Sandstein"
  moisture?: 'dry' | 'moderate' | 'moist' | 'wet';
  ph?: number;
};

type MatrixEntry = {
  match: (p: SoilProfile) => boolean;
  recommendations: SpeciesRecommendation[];
};

// Seed entries — expand with LWF / Bavarian forestry guidelines.
const MATRIX: MatrixEntry[] = [
  {
    match: (p) => /braunerde/i.test(p.soilClass) && p.moisture !== 'wet',
    recommendations: [
      { species: 'Buche', latin: 'Fagus sylvatica', confidence: 0.9 },
      { species: 'Traubeneiche', latin: 'Quercus petraea', confidence: 0.85 },
      {
        species: 'Fichte',
        latin: 'Picea abies',
        confidence: 0.55,
        contraindications: ['Borkenkäferrisiko bei Monokultur', 'Zunehmend trockenheitskritisch'],
      },
    ],
  },
  {
    match: (p) => /pseudogley|gley/i.test(p.soilClass),
    recommendations: [
      { species: 'Stieleiche', latin: 'Quercus robur', confidence: 0.88 },
      { species: 'Schwarzerle', latin: 'Alnus glutinosa', confidence: 0.8 },
      { species: 'Esche', latin: 'Fraxinus excelsior', confidence: 0.6, contraindications: ['Eschentriebsterben'] },
    ],
  },
  {
    match: (p) => /rendzina|kalk/i.test(p.soilClass) || /kalk/i.test(p.substrate ?? ''),
    recommendations: [
      { species: 'Buche', latin: 'Fagus sylvatica', confidence: 0.85 },
      { species: 'Bergahorn', latin: 'Acer pseudoplatanus', confidence: 0.8 },
      { species: 'Elsbeere', latin: 'Sorbus torminalis', confidence: 0.7 },
    ],
  },
  {
    match: (p) => /parabraunerde/i.test(p.soilClass),
    recommendations: [
      { species: 'Traubeneiche', latin: 'Quercus petraea', confidence: 0.9 },
      { species: 'Buche', latin: 'Fagus sylvatica', confidence: 0.85 },
      { species: 'Hainbuche', latin: 'Carpinus betulus', confidence: 0.75 },
    ],
  },
];

export function recommendSpecies(profile: SoilProfile): SpeciesRecommendation[] {
  const matches = MATRIX.filter((e) => e.match(profile)).flatMap((e) => e.recommendations);
  if (matches.length === 0) return [];
  // Dedupe by species, keep highest confidence.
  const byName = new Map<string, SpeciesRecommendation>();
  for (const r of matches) {
    const existing = byName.get(r.species);
    if (!existing || existing.confidence < r.confidence) byName.set(r.species, r);
  }
  return [...byName.values()].sort((a, b) => b.confidence - a.confidence);
}
