/**
 * Validation Utility Tests
 * Tests for input validation functions
 */

import {
  validate,
  sanitize,
  validatePassword,
  isPasswordValid,
  getPasswordStrength,
  getPasswordStrengthLevel,
  PASSWORD_RULES,
} from '../../utils/validation';
import { isValidUUID } from '../../utils/formatters';

describe('Validation Utils', () => {
  describe('validate.email', () => {
    it('should return true for valid emails', () => {
      expect(validate.email('test@example.com')).toBe(true);
      expect(validate.email('user.name@domain.co.uk')).toBe(true);
      expect(validate.email('user+tag@example.com')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(validate.email('')).toBe(false);
      expect(validate.email('invalid')).toBe(false);
      expect(validate.email('@example.com')).toBe(false);
      expect(validate.email('test@')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(validate.email(null as unknown as string)).toBe(false);
      expect(validate.email(undefined as unknown as string)).toBe(false);
    });
  });

  describe('validate.username', () => {
    it('should return true for valid usernames', () => {
      expect(validate.username('john_doe')).toBe(true);
      expect(validate.username('user123')).toBe(true);
    });

    it('should return false for invalid usernames', () => {
      expect(validate.username('')).toBe(false);
      expect(validate.username('user@name')).toBe(false);
      expect(validate.username('user name')).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    it('should return true for valid UUIDs', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should return false for invalid UUIDs', () => {
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID(null)).toBe(false);
      expect(isValidUUID(undefined)).toBe(false);
    });
  });

  describe('validate.url', () => {
    it('should return true for valid URLs', () => {
      expect(validate.url('https://example.com')).toBe(true);
      expect(validate.url('http://example.com/path')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(validate.url('')).toBe(false);
      expect(validate.url('not-a-url')).toBe(false);
      expect(validate.url('ftp://example.com')).toBe(false);
      // localhost may or may not be valid depending on regex implementation
    });
  });

  describe('sanitize', () => {
    it('should remove HTML tags and quotes', () => {
      // sanitize removes < > " ' characters
      expect(sanitize('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script');
    });

    it('should remove quotes', () => {
      expect(sanitize('"quoted"')).toBe('quoted');
      expect(sanitize("'single'")).toBe('single');
    });

    it('should trim whitespace', () => {
      expect(sanitize('  hello  ')).toBe('hello');
    });

    it('should handle null/undefined', () => {
      expect(sanitize(null)).toBe('');
      expect(sanitize(undefined)).toBe('');
    });
  });

  describe('validatePassword', () => {
    it('should return array of rule results', () => {
      const results = validatePassword('Test123!');
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(PASSWORD_RULES.length);
    });

    it('should mark rules as passed correctly', () => {
      const results = validatePassword('Short1!');
      const lengthResult = results.find((r) => r.id === 'length');
      const uppercaseResult = results.find((r) => r.id === 'uppercase');

      expect(lengthResult?.passed).toBe(false);
      expect(uppercaseResult?.passed).toBe(true);
    });
  });

  describe('isPasswordValid', () => {
    it('should return true for strong passwords', () => {
      expect(isPasswordValid('StrongPass123!')).toBe(true);
    });

    it('should return false for weak passwords', () => {
      expect(isPasswordValid('short')).toBe(false);
      expect(isPasswordValid('lowercase123!')).toBe(false);
    });
  });

  describe('getPasswordStrength', () => {
    it('should return 0 for empty password', () => {
      expect(getPasswordStrength('')).toBe(0);
    });

    it('should return higher score for stronger passwords', () => {
      const weak = getPasswordStrength('short');
      const strong = getPasswordStrength('Str0ng!P@ss');
      expect(weak).toBeLessThan(strong);
    });
  });

  describe('getPasswordStrengthLevel', () => {
    it('should return correct level object', () => {
      const level = getPasswordStrengthLevel('StrongPass123!');
      expect(level).toHaveProperty('level');
      expect(level).toHaveProperty('label');
      expect(level).toHaveProperty('color');
    });

    it('should return weak for short passwords', () => {
      const level = getPasswordStrengthLevel('short');
      expect(level.level).toBe('weak');
    });
  });
});
