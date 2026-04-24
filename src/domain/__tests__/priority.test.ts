import { describe, expect, it } from 'vitest';
import { defaultPriorityFor } from '../priority';

describe('defaultPriorityFor', () => {
  it('flags beetle observations critical', () => {
    expect(defaultPriorityFor('beetle')).toBe('critical');
  });

  it('treats reforestation as medium', () => {
    expect(defaultPriorityFor('reforestation')).toBe('medium');
  });

  it('treats unknown/other as low', () => {
    expect(defaultPriorityFor('other')).toBe('low');
  });
});
