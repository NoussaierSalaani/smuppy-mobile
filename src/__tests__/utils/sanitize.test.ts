/**
 * Sanitize Utility Tests
 * Tests for text sanitization functions that strip HTML tags and control characters.
 * Per CLAUDE.md: "ALL user input is hostile: validate, sanitize, truncate"
 */

import {
  sanitizeDisplayText,
  sanitizeContentText,
  sanitizeOptionalText,
} from '../../utils/sanitize';

describe('Sanitize Utils', () => {
  describe('sanitizeDisplayText', () => {
    it('should strip HTML tags', () => {
      expect(sanitizeDisplayText('<b>bold</b>')).toBe('bold');
    });

    it('should strip nested HTML tags', () => {
      expect(sanitizeDisplayText('<div><span>text</span></div>')).toBe('text');
    });

    it('should strip control characters', () => {
      expect(sanitizeDisplayText('hello\x00world')).toBe('helloworld');
    });

    it('should strip tabs and newlines (strict mode)', () => {
      expect(sanitizeDisplayText('line1\tline2\nline3')).toBe('line1line2line3');
    });

    it('should trim whitespace', () => {
      expect(sanitizeDisplayText('  hello  ')).toBe('hello');
    });

    it('should handle script tags (strips tags but not text content)', () => {
      expect(sanitizeDisplayText("<script>alert('xss')</script>safe")).toBe(
        "alert('xss')safe"
      );
    });

    it('should preserve normal text', () => {
      expect(sanitizeDisplayText('Hello World!')).toBe('Hello World!');
    });

    it('should handle combined HTML and control characters', () => {
      expect(sanitizeDisplayText('<p>he\x01llo</p>')).toBe('hello');
    });
  });

  describe('sanitizeContentText', () => {
    it('should strip HTML tags', () => {
      expect(sanitizeContentText('<b>bold</b>')).toBe('bold');
    });

    it('should strip control characters but preserve tabs', () => {
      expect(sanitizeContentText('hello\tworld')).toBe('hello\tworld');
    });

    it('should preserve newlines', () => {
      expect(sanitizeContentText('line1\nline2')).toBe('line1\nline2');
    });

    it('should preserve carriage returns', () => {
      expect(sanitizeContentText('line1\rline2')).toBe('line1\rline2');
    });

    it('should strip other control characters (e.g., \\x01, \\x02)', () => {
      expect(sanitizeContentText('he\x01llo')).toBe('hello');
    });

    it('should trim whitespace', () => {
      expect(sanitizeContentText('  hello  ')).toBe('hello');
    });
  });

  describe('sanitizeOptionalText', () => {
    it('should return empty string for null', () => {
      expect(sanitizeOptionalText(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(sanitizeOptionalText(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(sanitizeOptionalText('')).toBe('');
    });

    it('should sanitize non-empty text (delegates to sanitizeDisplayText)', () => {
      expect(sanitizeOptionalText('hello\x00world')).toBe('helloworld');
    });

    it('should strip HTML from non-empty text', () => {
      expect(sanitizeOptionalText('<b>bold</b>')).toBe('bold');
    });
  });
});
