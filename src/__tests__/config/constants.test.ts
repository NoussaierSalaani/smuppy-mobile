/**
 * Constants Configuration Tests
 * Tests for static constant data structure.
 */

import { SOCIAL_NETWORKS, COUNTRY_CODES } from '../../config/constants';

describe('Constants', () => {
  describe('SOCIAL_NETWORKS', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(SOCIAL_NETWORKS)).toBe(true);
      expect(SOCIAL_NETWORKS.length).toBeGreaterThan(0);
    });

    it('should have 8 social networks', () => {
      expect(SOCIAL_NETWORKS).toHaveLength(8);
    });

    it('should have items with correct shape', () => {
      SOCIAL_NETWORKS.forEach((network) => {
        expect(network).toHaveProperty('id');
        expect(network).toHaveProperty('icon');
        expect(network).toHaveProperty('label');
        expect(network).toHaveProperty('color');
      });
    });

    it('should have unique IDs', () => {
      const ids = SOCIAL_NETWORKS.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should include major platforms', () => {
      const ids = SOCIAL_NETWORKS.map((n) => n.id);
      expect(ids).toContain('instagram');
      expect(ids).toContain('tiktok');
      expect(ids).toContain('youtube');
      expect(ids).toContain('twitter');
      expect(ids).toContain('facebook');
    });
  });

  describe('COUNTRY_CODES', () => {
    it('should be a non-empty array', () => {
      expect(Array.isArray(COUNTRY_CODES)).toBe(true);
      expect(COUNTRY_CODES.length).toBeGreaterThan(0);
    });

    it('should have items with correct shape', () => {
      COUNTRY_CODES.forEach((entry) => {
        expect(entry).toHaveProperty('code');
        expect(entry).toHaveProperty('country');
        expect(entry).toHaveProperty('flag');
        expect(entry.code).toMatch(/^\+\d+$/);
      });
    });

    it('should include common country codes', () => {
      const codes = COUNTRY_CODES.map((c) => c.code);
      expect(codes).toContain('+1'); // US/CA
      expect(codes).toContain('+33'); // FR
      expect(codes).toContain('+44'); // UK
    });

    it('should have unique codes', () => {
      const codes = COUNTRY_CODES.map((c) => c.code);
      expect(new Set(codes).size).toBe(codes.length);
    });
  });
});
