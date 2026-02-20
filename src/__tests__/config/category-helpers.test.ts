/**
 * Category Helpers Tests
 * Tests for item() and cat() builder functions.
 */

import { item, cat } from '../../config/category-helpers';

describe('Category Helpers', () => {
  describe('item', () => {
    it('should create a CategoryItem with name, icon, color', () => {
      const result = item('Running', 'walk', '#FF5722');
      expect(result).toEqual({
        name: 'Running',
        icon: 'walk',
        color: '#FF5722',
      });
    });

    it('should preserve exact strings', () => {
      const result = item('BJJ / Jiu-Jitsu', 'body-outline', '#388E3C');
      expect(result.name).toBe('BJJ / Jiu-Jitsu');
      expect(result.icon).toBe('body-outline');
      expect(result.color).toBe('#388E3C');
    });
  });

  describe('cat', () => {
    it('should create a CategoryConfig with category, icon, color, and items', () => {
      const items = [
        item('Running', 'walk', '#FF5722'),
        item('Cycling', 'bicycle', '#E63946'),
      ];
      const result = cat('Sports', 'football', '#FF6B35', items);
      expect(result).toEqual({
        category: 'Sports',
        icon: 'football',
        color: '#FF6B35',
        items,
      });
    });

    it('should accept empty items array', () => {
      const result = cat('Empty', 'help', '#000', []);
      expect(result.items).toEqual([]);
    });
  });
});
