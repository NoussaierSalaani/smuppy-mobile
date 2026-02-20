/**
 * Business Categories Configuration Tests
 * Tests for static business category data structure.
 */

import { ALL_BUSINESS_CATEGORIES } from '../../config/businessCategories';
import type { BusinessCategoryItem } from '../../config/businessCategories';

describe('Business Categories', () => {
  it('should export a non-empty array', () => {
    expect(Array.isArray(ALL_BUSINESS_CATEGORIES)).toBe(true);
    expect(ALL_BUSINESS_CATEGORIES.length).toBeGreaterThan(0);
  });

  it('should have 22 categories', () => {
    expect(ALL_BUSINESS_CATEGORIES).toHaveLength(22);
  });

  it('should have items with correct shape', () => {
    ALL_BUSINESS_CATEGORIES.forEach((category: BusinessCategoryItem) => {
      expect(category).toHaveProperty('id');
      expect(category).toHaveProperty('icon');
      expect(category).toHaveProperty('label');
      expect(category).toHaveProperty('color');
      expect(typeof category.id).toBe('string');
      expect(typeof category.icon).toBe('string');
      expect(typeof category.label).toBe('string');
      expect(typeof category.color).toBe('string');
    });
  });

  it('should have unique IDs', () => {
    const ids = ALL_BUSINESS_CATEGORIES.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should have valid hex colors', () => {
    ALL_BUSINESS_CATEGORIES.forEach((category) => {
      expect(category.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('should include key categories', () => {
    const ids = ALL_BUSINESS_CATEGORIES.map((c) => c.id);
    expect(ids).toContain('gym');
    expect(ids).toContain('yoga_studio');
    expect(ids).toContain('crossfit');
    expect(ids).toContain('pool');
    expect(ids).toContain('boxing');
  });
});
