import { describe, expect, it } from 'vitest';
import { recommendSpecies } from '../species';

describe('recommendSpecies', () => {
  it('recommends beech and oak on Braunerde', () => {
    const recs = recommendSpecies({ soilClass: 'Braunerde', moisture: 'moderate' });
    expect(recs[0].species).toBe('Buche');
  });

  it('prefers wet-tolerant species on Pseudogley', () => {
    const recs = recommendSpecies({ soilClass: 'Pseudogley', moisture: 'wet' });
    expect(recs.map((r) => r.species)).toContain('Stieleiche');
    expect(recs.map((r) => r.species)).toContain('Schwarzerle');
  });

  it('returns empty for unknown soil', () => {
    expect(recommendSpecies({ soilClass: 'Regolith' })).toEqual([]);
  });

  it('flags Fichte contraindications', () => {
    const recs = recommendSpecies({ soilClass: 'Braunerde' });
    const fichte = recs.find((r) => r.species === 'Fichte');
    expect(fichte?.contraindications?.length).toBeGreaterThan(0);
  });
});
