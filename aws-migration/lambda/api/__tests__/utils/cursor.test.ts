/**
 * Tests for utils/cursor — parseCursor, cursorToSql, generateCursor
 */

jest.unmock('../../utils/security');

import { parseCursor, cursorToSql, generateCursor } from '../../utils/cursor';

// ── parseCursor ──

describe('parseCursor', () => {
  describe('timestamp-ms', () => {
    it.each([
      ['valid timestamp', '1707393600000', true],
      ['zero', '0', true],
      ['NaN string', 'abc', false],
      ['empty string', '', false],
      ['null', null, false],
      ['undefined', undefined, false],
      ['float', '123.456', true], // parseInt ignores decimal
    ])('should handle %s → valid=%s', (_label, input, shouldBeValid) => {
      const result = parseCursor(input as string | undefined, 'timestamp-ms');
      if (shouldBeValid) {
        expect(result).not.toBeNull();
        expect(result!.type).toBe('timestamp-ms');
        expect(result!).toHaveProperty('date');
      } else {
        expect(result).toBeNull();
      }
    });
  });

  describe('iso', () => {
    it.each([
      ['valid ISO', '2026-02-20T12:00:00Z', true],
      ['valid ISO no Z', '2026-02-20T12:00:00', true],
      ['invalid date', 'not-a-date', false],
      ['empty', '', false],
      ['null', null, false],
    ])('should handle %s → valid=%s', (_label, input, shouldBeValid) => {
      const result = parseCursor(input as string | undefined, 'iso');
      if (shouldBeValid) {
        expect(result).not.toBeNull();
        expect(result!.type).toBe('iso');
      } else {
        expect(result).toBeNull();
      }
    });
  });

  describe('compound', () => {
    const validUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

    it('should parse valid compound cursor (ISO|UUID)', () => {
      const result = parseCursor(`2026-02-20T12:00:00Z|${validUUID}`, 'compound');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('compound');
      if (result!.type === 'compound') {
        expect(result!.id).toBe(validUUID);
        expect(result!.date).toBeInstanceOf(Date);
      }
    });

    it('should reject compound cursor with invalid UUID', () => {
      const result = parseCursor('2026-02-20T12:00:00Z|bad-uuid', 'compound');
      expect(result).toBeNull();
    });

    it('should reject compound cursor with invalid date', () => {
      const result = parseCursor(`not-a-date|${validUUID}`, 'compound');
      expect(result).toBeNull();
    });

    it('should fall back to timestamp-ms when no pipe separator', () => {
      const result = parseCursor('1707393600000', 'compound');
      expect(result).not.toBeNull();
      expect(result!.type).toBe('timestamp-ms');
    });

    it('should return null for NaN fallback', () => {
      const result = parseCursor('abc', 'compound');
      expect(result).toBeNull();
    });
  });

  describe('offset', () => {
    it.each([
      ['valid 0', '0', true, 0],
      ['valid 10', '10', true, 10],
      ['negative', '-1', false, 0],
      ['NaN', 'abc', false, 0],
      ['empty', '', false, 0],
    ])('should handle %s → valid=%s', (_label, input, shouldBeValid, expectedOffset) => {
      const result = parseCursor(input as string, 'offset');
      if (shouldBeValid) {
        expect(result).not.toBeNull();
        expect(result!.type).toBe('offset');
        if (result!.type === 'offset') {
          expect(result!.offset).toBe(expectedOffset);
        }
      } else {
        expect(result).toBeNull();
      }
    });
  });

  describe('tolerant policy', () => {
    it('should return null (not throw) for any invalid input', () => {
      expect(() => parseCursor('garbage', 'timestamp-ms')).not.toThrow();
      expect(() => parseCursor('garbage', 'iso')).not.toThrow();
      expect(() => parseCursor('garbage', 'compound')).not.toThrow();
      expect(() => parseCursor('garbage', 'offset')).not.toThrow();
    });
  });
});

// ── cursorToSql ──

describe('cursorToSql', () => {
  it('should generate timestamp condition', () => {
    const parsed = parseCursor('1707393600000', 'timestamp-ms')!;
    const { condition, params } = cursorToSql(parsed, 'c.created_at', 3);
    expect(condition).toBe(' AND c.created_at < $3');
    expect(params).toHaveLength(1);
    expect(params[0]).toBeInstanceOf(Date);
  });

  it('should generate ISO condition', () => {
    const parsed = parseCursor('2026-02-20T12:00:00Z', 'iso')!;
    const { condition, params } = cursorToSql(parsed, 'n.created_at', 2);
    expect(condition).toBe(' AND n.created_at < $2');
    expect(params).toHaveLength(1);
  });

  it('should generate compound condition', () => {
    const validUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const parsed = parseCursor(`2026-02-20T12:00:00Z|${validUUID}`, 'compound')!;
    const { condition, params } = cursorToSql(parsed, 'p.created_at', 3);
    expect(condition).toContain('(p.created_at, p.id) <');
    expect(condition).toContain('$3::timestamptz');
    expect(condition).toContain('$4::uuid');
    expect(params).toHaveLength(2);
    expect(params[1]).toBe(validUUID);
  });

  it('should generate offset condition', () => {
    const parsed = parseCursor('10', 'offset')!;
    const { condition, params } = cursorToSql(parsed, 'unused', 5);
    expect(condition).toBe(' OFFSET $5');
    expect(params).toEqual([10]);
  });
});

// ── generateCursor ──

describe('generateCursor', () => {
  const now = new Date('2026-02-20T12:00:00Z');

  it('should generate timestamp-ms cursor', () => {
    const cursor = generateCursor('timestamp-ms', { created_at: now, id: 'x' });
    expect(cursor).toBe(now.getTime().toString());
  });

  it('should generate iso cursor', () => {
    const cursor = generateCursor('iso', { created_at: now, id: 'x' });
    expect(cursor).toBe(now.toISOString());
  });

  it('should generate compound cursor', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const cursor = generateCursor('compound', { created_at: now, id });
    expect(cursor).toBe(`${now.toISOString()}|${id}`);
  });

  it('should support custom date column', () => {
    const cursor = generateCursor('timestamp-ms', { saved_at: now, id: 'x' }, 'saved_at');
    expect(cursor).toBe(now.getTime().toString());
  });

  it('should handle string date values', () => {
    const cursor = generateCursor('timestamp-ms', {
      created_at: '2026-02-20T12:00:00Z',
      id: 'x',
    });
    expect(cursor).toBe(now.getTime().toString());
  });
});
