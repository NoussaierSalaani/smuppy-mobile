/**
 * Security Utils Unit Tests
 */

import {
  sanitizeInput,
  isValidUUID,
  isValidEmail,
  isValidUsername,
  checkRateLimit,
} from '../../utils/security';

describe('Security Utils', () => {
  describe('sanitizeInput', () => {
    it('should trim whitespace', () => {
      expect(sanitizeInput('  hello  ')).toBe('hello');
    });

    it('should remove null bytes', () => {
      expect(sanitizeInput('hello\0world')).toBe('helloworld');
    });

    it('should remove control characters', () => {
      expect(sanitizeInput('hello\x00\x01\x02world')).toBe('helloworld');
    });

    it('should preserve newlines and tabs', () => {
      expect(sanitizeInput('hello\nworld\ttab')).toBe('hello\nworld\ttab');
    });

    it('should truncate to max length', () => {
      expect(sanitizeInput('hello world', 5)).toBe('hello');
    });

    it('should handle empty string', () => {
      expect(sanitizeInput('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeInput(null as any)).toBe('');
      expect(sanitizeInput(undefined as any)).toBe('');
    });

    it('should handle non-string input', () => {
      expect(sanitizeInput(123 as any)).toBe('');
    });
  });

  describe('isValidUUID', () => {
    it('should accept valid UUIDs', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID('550e8400-e29b-61d4-a716-44665544000')).toBe(false); // Wrong length
    });

    it('should reject null/undefined', () => {
      expect(isValidUUID(null as any)).toBe(false);
      expect(isValidUUID(undefined as any)).toBe(false);
    });

    it('should reject SQL injection attempts', () => {
      expect(isValidUUID("'; DROP TABLE users; --")).toBe(false);
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000; DELETE')).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('should accept valid emails', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
      expect(isValidEmail('user+tag@gmail.com')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@domain.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('user@domain')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });

    it('should reject emails that are too long', () => {
      const longEmail = 'a'.repeat(250) + '@b.com';
      expect(isValidEmail(longEmail)).toBe(false);
    });

    it('should reject XSS attempts', () => {
      expect(isValidEmail('<script>alert(1)</script>@evil.com')).toBe(false);
      expect(isValidEmail('test@<script>.com')).toBe(false);
    });
  });

  describe('isValidUsername', () => {
    it('should accept valid usernames', () => {
      expect(isValidUsername('john_doe')).toBe(true);
      expect(isValidUsername('User123')).toBe(true);
      expect(isValidUsername('abc')).toBe(true);
    });

    it('should reject invalid usernames', () => {
      expect(isValidUsername('ab')).toBe(false); // Too short
      expect(isValidUsername('a'.repeat(31))).toBe(false); // Too long
      expect(isValidUsername('user name')).toBe(false); // Space
      expect(isValidUsername('user@name')).toBe(false); // Special char
      expect(isValidUsername('')).toBe(false);
    });

    it('should reject injection attempts', () => {
      expect(isValidUsername("admin'--")).toBe(false);
      expect(isValidUsername('user<script>')).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests under limit', () => {
      const limits = new Map<string, { count: number; resetTime: number }>();

      expect(checkRateLimit('req1', '192.168.1.1', limits, 5, 60000)).toBe(false);
      expect(checkRateLimit('req2', '192.168.1.1', limits, 5, 60000)).toBe(false);
      expect(checkRateLimit('req3', '192.168.1.1', limits, 5, 60000)).toBe(false);
    });

    it('should block requests over limit', () => {
      const limits = new Map<string, { count: number; resetTime: number }>();

      // Make 5 requests (limit)
      for (let i = 0; i < 5; i++) {
        checkRateLimit(`req${i}`, '192.168.1.1', limits, 5, 60000);
      }

      // 6th request should be blocked
      expect(checkRateLimit('req6', '192.168.1.1', limits, 5, 60000)).toBe(true);
    });

    it('should track different IPs separately', () => {
      const limits = new Map<string, { count: number; resetTime: number }>();

      // Max out IP1
      for (let i = 0; i < 5; i++) {
        checkRateLimit(`req${i}`, '192.168.1.1', limits, 5, 60000);
      }

      // IP2 should still be allowed
      expect(checkRateLimit('req1', '192.168.1.2', limits, 5, 60000)).toBe(false);
    });

    it('should reset after window expires', () => {
      const limits = new Map<string, { count: number; resetTime: number }>();

      // Set an expired entry
      limits.set('192.168.1.1', { count: 100, resetTime: Date.now() - 1000 });

      // Should be allowed (reset)
      expect(checkRateLimit('req1', '192.168.1.1', limits, 5, 60000)).toBe(false);
    });
  });
});
