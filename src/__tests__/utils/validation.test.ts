/**
 * Validation Utility Tests
 */

describe('UUID Validation', () => {
  const isValidUUID = (uuid: string): boolean => {
    if (!uuid || typeof uuid !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  };

  it('should accept valid UUIDs', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true);
    expect(isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
  });

  it('should reject invalid UUIDs', () => {
    expect(isValidUUID('')).toBe(false);
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false); // Too short
    expect(isValidUUID('550e8400-e29b-61d4-a716-446655440000')).toBe(false); // Invalid version
    expect(isValidUUID('550e8400-e29b-41d4-f716-446655440000')).toBe(false); // Invalid variant
  });
});

describe('Phone Number Validation', () => {
  const isValidPhoneNumber = (phone: string): boolean => {
    // E.164 format: +[country code][number]
    const phoneRegex = /^\+[1-9]\d{6,14}$/;
    return phoneRegex.test(phone);
  };

  it('should accept valid phone numbers', () => {
    expect(isValidPhoneNumber('+14155552671')).toBe(true);
    expect(isValidPhoneNumber('+33612345678')).toBe(true);
    expect(isValidPhoneNumber('+442071234567')).toBe(true);
  });

  it('should reject invalid phone numbers', () => {
    expect(isValidPhoneNumber('')).toBe(false);
    expect(isValidPhoneNumber('14155552671')).toBe(false); // Missing +
    expect(isValidPhoneNumber('+0123456789')).toBe(false); // Invalid country code
    expect(isValidPhoneNumber('+1')).toBe(false); // Too short
  });
});

describe('Username Validation', () => {
  const isValidUsername = (username: string): boolean => {
    if (!username || typeof username !== 'string') return false;
    // Alphanumeric, underscores, 3-30 characters
    const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
    return usernameRegex.test(username);
  };

  it('should accept valid usernames', () => {
    expect(isValidUsername('john_doe')).toBe(true);
    expect(isValidUsername('user123')).toBe(true);
    expect(isValidUsername('JohnDoe')).toBe(true);
  });

  it('should reject invalid usernames', () => {
    expect(isValidUsername('')).toBe(false);
    expect(isValidUsername('ab')).toBe(false); // Too short
    expect(isValidUsername('user name')).toBe(false); // Contains space
    expect(isValidUsername('user@name')).toBe(false); // Contains @
    expect(isValidUsername('a'.repeat(31))).toBe(false); // Too long
  });
});

describe('Input Sanitization', () => {
  const sanitizeInput = (input: string): string => {
    if (!input || typeof input !== 'string') return '';
    return input
      .trim()
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/[<>'"&]/g, (char) => {
        const entities: Record<string, string> = {
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;',
          '&': '&amp;',
        };
        return entities[char] || char;
      });
  };

  it('should remove HTML tags', () => {
    // After removing tags, quotes are still escaped
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe('alert(&quot;xss&quot;)');
    expect(sanitizeInput('<b>bold</b>')).toBe('bold');
  });

  it('should trim whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
    expect(sanitizeInput('\t\ntest\t\n')).toBe('test');
  });

  it('should handle empty inputs', () => {
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(null as any)).toBe('');
    expect(sanitizeInput(undefined as any)).toBe('');
  });
});

describe('URL Validation', () => {
  const isValidUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  it('should accept valid URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('https://api.example.com/v1/users')).toBe(true);
  });

  it('should reject invalid URLs', () => {
    expect(isValidUrl('')).toBe(false);
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('ftp://files.example.com')).toBe(false); // FTP not allowed
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('Date Validation', () => {
  const isValidDate = (dateString: string): boolean => {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  };

  it('should accept valid dates', () => {
    expect(isValidDate('2024-01-15')).toBe(true);
    expect(isValidDate('2024-01-15T10:30:00Z')).toBe(true);
    expect(isValidDate('January 15, 2024')).toBe(true);
  });

  it('should reject invalid dates', () => {
    expect(isValidDate('')).toBe(false);
    expect(isValidDate('not-a-date')).toBe(false);
    expect(isValidDate('2024-13-45')).toBe(false); // Invalid month/day
  });
});
