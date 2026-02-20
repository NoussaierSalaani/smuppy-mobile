/**
 * Interests Configuration Tests
 * Tests for static interests data structure.
 */

import { ALL_INTERESTS } from '../../config/interests';

describe('Interests', () => {
  it('should export a non-empty array', () => {
    expect(Array.isArray(ALL_INTERESTS)).toBe(true);
    expect(ALL_INTERESTS.length).toBeGreaterThan(0);
  });

  it('should have categories with correct shape', () => {
    ALL_INTERESTS.forEach((category) => {
      expect(category).toHaveProperty('category');
      expect(category).toHaveProperty('icon');
      expect(category).toHaveProperty('color');
      expect(category).toHaveProperty('items');
      expect(typeof category.category).toBe('string');
      expect(typeof category.icon).toBe('string');
      expect(typeof category.color).toBe('string');
      expect(Array.isArray(category.items)).toBe(true);
    });
  });

  it('should have items with correct shape', () => {
    ALL_INTERESTS.forEach((category) => {
      category.items.forEach((item) => {
        expect(item).toHaveProperty('name');
        expect(item).toHaveProperty('icon');
        expect(item).toHaveProperty('color');
        expect(typeof item.name).toBe('string');
        expect(typeof item.icon).toBe('string');
        expect(typeof item.color).toBe('string');
      });
    });
  });

  it('should have unique category names', () => {
    const names = ALL_INTERESTS.map((c) => c.category);
    expect(new Set(names).size).toBe(names.length);
  });

  it('should have at least one item per category', () => {
    ALL_INTERESTS.forEach((category) => {
      expect(category.items.length).toBeGreaterThan(0);
    });
  });

  it('should include key categories', () => {
    const names = ALL_INTERESTS.map((c) => c.category);
    expect(names).toContain('Sports');
    expect(names).toContain('Fitness');
    expect(names).toContain('Wellness');
    expect(names).toContain('Outdoor');
  });

  it('should have valid hex colors for categories', () => {
    ALL_INTERESTS.forEach((category) => {
      expect(category.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});
