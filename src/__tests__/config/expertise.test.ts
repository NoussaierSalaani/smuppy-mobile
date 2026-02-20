/**
 * Expertise Configuration Tests
 * Tests for static expertise data structure.
 */

import { ALL_EXPERTISE } from '../../config/expertise';

describe('Expertise', () => {
  it('should export a non-empty array', () => {
    expect(Array.isArray(ALL_EXPERTISE)).toBe(true);
    expect(ALL_EXPERTISE.length).toBeGreaterThan(0);
  });

  it('should have categories with correct shape', () => {
    ALL_EXPERTISE.forEach((category) => {
      expect(category).toHaveProperty('category');
      expect(category).toHaveProperty('icon');
      expect(category).toHaveProperty('color');
      expect(category).toHaveProperty('items');
      expect(typeof category.category).toBe('string');
      expect(Array.isArray(category.items)).toBe(true);
    });
  });

  it('should have items with correct shape', () => {
    ALL_EXPERTISE.forEach((category) => {
      category.items.forEach((item) => {
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('icon');
        expect(item).toHaveProperty('color');
      });
    });
  });

  it('should have unique category names', () => {
    const names = ALL_EXPERTISE.map((c) => c.category);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should include key expertise categories', () => {
    const names = ALL_EXPERTISE.map((c) => c.category);
    expect(names).toContain('Personal Training');
    expect(names).toContain('Yoga & Pilates');
    expect(names).toContain('Nutrition & Diet');
    expect(names).toContain('Combat Sports');
  });

  it('should have at least one item per category', () => {
    ALL_EXPERTISE.forEach((category) => {
      expect(category.items.length).toBeGreaterThan(0);
    });
  });
});
