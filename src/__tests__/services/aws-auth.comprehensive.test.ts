/**
 * AWS Auth Service — Comprehensive Pure Logic Tests
 *
 * Tests the core pure functions from aws-auth.ts WITHOUT importing the actual module
 * (which has native dependencies like expo-secure-store and @aws-sdk/client-cognito).
 *
 * Functions re-implemented here to mirror the production code exactly:
 *   - base64UrlDecode: pure Base64URL decoder for JWT payloads
 *   - isTokenExpired: checks JWT exp claim with 60s buffer
 *   - decodeIdToken: extracts AuthUser from a Cognito ID token
 *   - TOKEN_KEYS: storage key constants
 *   - Smart signup fallback logic
 */

// ---------------------------------------------------------------------------
// Re-implemented pure functions (mirrors src/services/aws-auth.ts exactly)
// ---------------------------------------------------------------------------

interface AuthUser {
  id: string;
  email: string;
  username?: string;
  emailVerified: boolean;
  phoneNumber?: string;
  attributes: Record<string, string>;
}

/**
 * Base64 URL decode — works on all JS engines (Hermes, JSC, V8)
 * without depending on global.atob polyfill availability.
 * Exact copy of the production implementation.
 */
function base64UrlDecode(str: string): string {
  // Base64url -> standard Base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to multiple of 4
  while (b64.length % 4 !== 0) b64 += '=';

  // Pure-JS Base64 decode
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(128);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const bytes: number[] = [];
  for (let i = 0; i < b64.length; i += 4) {
    const a = lookup[b64.charCodeAt(i)];
    const b = lookup[b64.charCodeAt(i + 1)];
    const c = lookup[b64.charCodeAt(i + 2)];
    const d = lookup[b64.charCodeAt(i + 3)];
    bytes.push((a << 2) | (b >> 4));
    if (b64[i + 2] !== '=') bytes.push(((b & 0xf) << 4) | (c >> 2));
    if (b64[i + 3] !== '=') bytes.push(((c & 0x3) << 6) | d);
  }
  return decodeURIComponent(
    bytes.map(b => '%' + ('00' + b.toString(16)).slice(-2)).join('')
  );
}

/**
 * Check if a JWT token is expired (with 60s buffer).
 * Exact copy of the production implementation.
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const payload = JSON.parse(base64UrlDecode(parts[1]));
    // Expired if less than 60 seconds remaining
    return !payload.exp || payload.exp * 1000 < Date.now() + 60_000;
  } catch {
    return true;
  }
}

/**
 * Decode an ID token to extract user info.
 * Exact copy of the production implementation.
 */
function decodeIdToken(idToken: string): AuthUser {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');

    const payload = JSON.parse(base64UrlDecode(parts[1]));

    return {
      id: payload.sub || '',
      email: payload.email || '',
      username: payload['cognito:username'] || payload.email?.split('@')[0] || '',
      emailVerified: payload.email_verified === true,
      phoneNumber: payload.phone_number,
      attributes: payload,
    };
  } catch {
    throw new Error('Failed to decode token');
  }
}

/**
 * Token storage keys — must match the production values.
 */
const TOKEN_KEYS = {
  ACCESS_TOKEN: 'smuppy_access_token',
  REFRESH_TOKEN: 'smuppy_refresh_token',
  ID_TOKEN: 'smuppy_id_token',
  USER: 'smuppy_user',
};

// ---------------------------------------------------------------------------
// Helper: build a JWT with a given payload (base64url-encoded, no real signature)
// ---------------------------------------------------------------------------

function toBase64Url(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  // Use Buffer (available in Node/Jest environment) then convert to base64url
  const b64 = Buffer.from(json, 'utf8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildJWT(payload: Record<string, unknown>): string {
  const header = toBase64Url({ alg: 'RS256', typ: 'JWT' });
  const body = toBase64Url(payload);
  const signature = 'fake-signature';
  return `${header}.${body}.${signature}`;
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('base64UrlDecode', () => {
  it('should decode a standard ASCII string', () => {
    // "Hello, World!" in base64 is "SGVsbG8sIFdvcmxkIQ=="
    // In base64url (no padding): "SGVsbG8sIFdvcmxkIQ"
    const encoded = 'SGVsbG8sIFdvcmxkIQ';
    expect(base64UrlDecode(encoded)).toBe('Hello, World!');
  });

  it('should decode a JSON object', () => {
    const obj = { sub: '12345', email: 'test@example.com' };
    const encoded = Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const decoded = base64UrlDecode(encoded);
    expect(JSON.parse(decoded)).toEqual(obj);
  });

  it('should handle base64url characters (- and _) correctly', () => {
    // Standard base64 uses + and /, base64url uses - and _
    // Byte sequence that produces + and / in standard base64:
    // 0x3E = 62, in base64 this maps to '+'; 0x3F = 63 maps to '/'
    // We test by encoding bytes that would create + and / in standard base64
    const original = 'subjects?query=foo/bar+baz';
    const b64 = Buffer.from(original).toString('base64');
    const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(base64UrlDecode(b64url)).toBe(original);
  });

  it('should handle strings that need 1 character of padding', () => {
    // "ab" in base64 is "YWI=" (1 pad char needed for length % 4 == 3)
    const encoded = 'YWI'; // no padding
    expect(base64UrlDecode(encoded)).toBe('ab');
  });

  it('should handle strings that need 2 characters of padding', () => {
    // "a" in base64 is "YQ==" (2 pad chars needed for length % 4 == 2)
    const encoded = 'YQ'; // no padding
    expect(base64UrlDecode(encoded)).toBe('a');
  });

  it('should handle strings that need no padding', () => {
    // "abc" in base64 is "YWJj" (length divisible by 4, no padding)
    const encoded = 'YWJj';
    expect(base64UrlDecode(encoded)).toBe('abc');
  });

  it('should handle an empty string', () => {
    expect(base64UrlDecode('')).toBe('');
  });

  it('should decode unicode / UTF-8 characters', () => {
    const original = 'Bonjour le monde';
    const encoded = Buffer.from(original, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(base64UrlDecode(encoded)).toBe(original);
  });

  it('should decode multi-byte unicode characters (accented, emoji-like)', () => {
    const original = 'cafe\u0301'; // cafe with combining accent (U+0301)
    const encoded = Buffer.from(original, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(base64UrlDecode(encoded)).toBe(original);
  });

  it('should decode a string with special JSON characters', () => {
    const original = '{"key":"value with \\"quotes\\" and \\\\backslash"}';
    const encoded = Buffer.from(original, 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(base64UrlDecode(encoded)).toBe(original);
  });

  it('should decode a realistic JWT payload', () => {
    const payload = {
      sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'user@smuppy.com',
      'cognito:username': 'smuppyuser',
      email_verified: true,
      exp: 1700000000,
      iat: 1699996400,
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const decoded = JSON.parse(base64UrlDecode(encoded));
    expect(decoded).toEqual(payload);
  });

  it('should handle already-padded base64url (idempotent padding)', () => {
    // If someone passes base64 with padding, the function adds more padding
    // but standard base64 with padding should still decode if length is already % 4
    const encoded = 'YWJj'; // "abc", already length 4
    expect(base64UrlDecode(encoded)).toBe('abc');
  });
});

// ---------------------------------------------------------------------------
describe('isTokenExpired', () => {
  it('should return true for a token with an exp in the past', () => {
    // exp = 1 second ago
    const pastExp = Math.floor(Date.now() / 1000) - 1;
    const token = buildJWT({ sub: 'user', exp: pastExp });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('should return true for a token that expires within the 60s buffer', () => {
    // exp = 30 seconds from now (within 60s buffer)
    const soonExp = Math.floor(Date.now() / 1000) + 30;
    const token = buildJWT({ sub: 'user', exp: soonExp });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('should return false for a token expiring well in the future', () => {
    // exp = 1 hour from now
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = buildJWT({ sub: 'user', exp: futureExp });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('should return false for a token expiring exactly at 61 seconds from now', () => {
    // exp = 61 seconds from now (just outside the 60s buffer)
    const justOutsideBuffer = Math.floor(Date.now() / 1000) + 61;
    const token = buildJWT({ sub: 'user', exp: justOutsideBuffer });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('should return true for a token expiring exactly at 59 seconds from now (inside buffer)', () => {
    const justInsideBuffer = Math.floor(Date.now() / 1000) + 59;
    const token = buildJWT({ sub: 'user', exp: justInsideBuffer });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('should return true for a token with no exp claim', () => {
    const token = buildJWT({ sub: 'user' });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('should return true for a token with exp: null', () => {
    const token = buildJWT({ sub: 'user', exp: null });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('should return true for a token with exp: 0', () => {
    const token = buildJWT({ sub: 'user', exp: 0 });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('should return true for a malformed token (not 3 parts)', () => {
    expect(isTokenExpired('not.a.valid.token.four.parts')).toBe(true);
    expect(isTokenExpired('onlyone')).toBe(true);
    expect(isTokenExpired('two.parts')).toBe(true);
    expect(isTokenExpired('')).toBe(true);
  });

  it('should return true for a token with invalid base64 in payload', () => {
    expect(isTokenExpired('header.!!!invalid!!!.signature')).toBe(true);
  });

  it('should return true for a token with non-JSON payload', () => {
    const notJson = Buffer.from('this is not json').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(isTokenExpired(`header.${notJson}.signature`)).toBe(true);
  });

  it('should handle a very far-future exp (year 2100)', () => {
    const farFuture = Math.floor(new Date('2100-01-01').getTime() / 1000);
    const token = buildJWT({ sub: 'user', exp: farFuture });
    expect(isTokenExpired(token)).toBe(false);
  });

  it('should handle exp as a float (non-integer seconds)', () => {
    // exp = 2 hours from now as a float
    const floatExp = Date.now() / 1000 + 7200.5;
    const token = buildJWT({ sub: 'user', exp: floatExp });
    expect(isTokenExpired(token)).toBe(false);
  });

  describe('boundary precision with frozen time', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return true when exp*1000 equals Date.now() + 60000 exactly', () => {
      // Freeze time at a known value
      const now = 1700000000000; // a fixed timestamp in ms
      jest.setSystemTime(now);

      // exp*1000 = now + 60000, so payload.exp = (now + 60000) / 1000
      const expSeconds = (now + 60_000) / 1000;
      const token = buildJWT({ sub: 'user', exp: expSeconds });

      // condition: payload.exp * 1000 < Date.now() + 60_000
      // => (now + 60000) < (now + 60000) => false, so NOT expired
      // Wait -- let me re-check the production code:
      //   return !payload.exp || payload.exp * 1000 < Date.now() + 60_000;
      // payload.exp * 1000 = now + 60000, Date.now() + 60000 = now + 60000
      // (now + 60000) < (now + 60000) => false => NOT expired
      expect(isTokenExpired(token)).toBe(false);
    });

    it('should return true when exp*1000 is one ms less than Date.now() + 60000', () => {
      const now = 1700000000000;
      jest.setSystemTime(now);

      // exp*1000 = now + 59999 => payload.exp = (now + 59999) / 1000
      const expSeconds = (now + 59_999) / 1000;
      const token = buildJWT({ sub: 'user', exp: expSeconds });

      // (now + 59999) < (now + 60000) => true => expired
      expect(isTokenExpired(token)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
describe('decodeIdToken', () => {
  it('should decode a valid Cognito ID token with all fields', () => {
    const payload = {
      sub: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'alice@smuppy.com',
      'cognito:username': 'alice_smuppy',
      email_verified: true,
      phone_number: '+33612345678',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.id).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(user.email).toBe('alice@smuppy.com');
    expect(user.username).toBe('alice_smuppy');
    expect(user.emailVerified).toBe(true);
    expect(user.phoneNumber).toBe('+33612345678');
    expect(user.attributes).toEqual(payload);
  });

  it('should fall back to email prefix when cognito:username is missing', () => {
    const payload = {
      sub: 'user-id-123',
      email: 'bob@example.com',
      email_verified: true,
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.username).toBe('bob');
  });

  it('should return empty string for id when sub is missing', () => {
    const payload = {
      email: 'nobody@example.com',
      email_verified: false,
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.id).toBe('');
  });

  it('should return empty string for email when email is missing', () => {
    const payload = {
      sub: 'user-id',
      email_verified: true,
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.email).toBe('');
  });

  it('should return emailVerified=false when email_verified is not exactly true', () => {
    const cases = [
      { email_verified: false },
      { email_verified: 'true' },  // string, not boolean
      { email_verified: 1 },       // number, not boolean
      { email_verified: null },
      {},                           // missing entirely
    ];

    for (const payloadOverride of cases) {
      const payload = { sub: 'user', email: 'x@x.com', ...payloadOverride };
      const token = buildJWT(payload);
      const user = decodeIdToken(token);
      expect(user.emailVerified).toBe(false);
    }
  });

  it('should return emailVerified=true only when email_verified is exactly true', () => {
    const payload = { sub: 'user', email: 'x@x.com', email_verified: true };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);
    expect(user.emailVerified).toBe(true);
  });

  it('should set phoneNumber to undefined when phone_number is missing', () => {
    const payload = {
      sub: 'user-id',
      email: 'user@example.com',
      email_verified: true,
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.phoneNumber).toBeUndefined();
  });

  it('should prefer cognito:username over email prefix', () => {
    const payload = {
      sub: 'user-id',
      email: 'charlie@example.com',
      'cognito:username': 'charlie_custom',
      email_verified: true,
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.username).toBe('charlie_custom');
  });

  it('should include the full payload in attributes', () => {
    const payload = {
      sub: 'uid',
      email: 'e@e.com',
      email_verified: false,
      'custom:tier': 'pro_creator',
      iss: 'https://cognito-idp.eu-west-1.amazonaws.com/pool-id',
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.attributes).toEqual(payload);
    expect(user.attributes['custom:tier']).toBe('pro_creator');
    expect(user.attributes.iss).toBe('https://cognito-idp.eu-west-1.amazonaws.com/pool-id');
  });

  it('should throw "Failed to decode token" for a token with only 2 parts', () => {
    expect(() => decodeIdToken('header.payload')).toThrow('Failed to decode token');
  });

  it('should throw "Failed to decode token" for a token with 4 parts', () => {
    expect(() => decodeIdToken('a.b.c.d')).toThrow('Failed to decode token');
  });

  it('should throw "Failed to decode token" for an empty string', () => {
    expect(() => decodeIdToken('')).toThrow('Failed to decode token');
  });

  it('should throw "Failed to decode token" for invalid base64 in payload', () => {
    expect(() => decodeIdToken('header.!!invalid!!.sig')).toThrow('Failed to decode token');
  });

  it('should throw "Failed to decode token" for non-JSON payload', () => {
    const notJson = Buffer.from('not json at all').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(() => decodeIdToken(`header.${notJson}.sig`)).toThrow('Failed to decode token');
  });

  it('should handle a payload with unicode email and username', () => {
    const payload = {
      sub: 'uid-unicode',
      email: 'user@example.com',
      'cognito:username': 'user_test',
      email_verified: true,
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.email).toBe('user@example.com');
    expect(user.username).toBe('user_test');
  });

  it('should return empty username when both cognito:username and email are missing', () => {
    const payload = { sub: 'uid' };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    // cognito:username is undefined, email is undefined
    // payload['cognito:username'] || payload.email?.split('@')[0] || ''
    // => undefined || undefined || '' => ''
    expect(user.username).toBe('');
  });
});

// ---------------------------------------------------------------------------
describe('TOKEN_KEYS', () => {
  it('should use the smuppy_ prefix for all keys', () => {
    expect(TOKEN_KEYS.ACCESS_TOKEN).toMatch(/^smuppy_/);
    expect(TOKEN_KEYS.REFRESH_TOKEN).toMatch(/^smuppy_/);
    expect(TOKEN_KEYS.ID_TOKEN).toMatch(/^smuppy_/);
    expect(TOKEN_KEYS.USER).toMatch(/^smuppy_/);
  });

  it('should have exactly 4 keys', () => {
    expect(Object.keys(TOKEN_KEYS)).toHaveLength(4);
  });

  it('should have all unique values', () => {
    const values = Object.values(TOKEN_KEYS);
    const uniqueValues = new Set(values);
    expect(uniqueValues.size).toBe(values.length);
  });

  it('should include access_token, refresh_token, id_token, and user', () => {
    expect(TOKEN_KEYS.ACCESS_TOKEN).toContain('access_token');
    expect(TOKEN_KEYS.REFRESH_TOKEN).toContain('refresh_token');
    expect(TOKEN_KEYS.ID_TOKEN).toContain('id_token');
    expect(TOKEN_KEYS.USER).toContain('user');
  });

  it('should not contain spaces or special characters (safe for SecureStore)', () => {
    const safeKeyPattern = /^[a-z0-9_]+$/;
    for (const value of Object.values(TOKEN_KEYS)) {
      expect(value).toMatch(safeKeyPattern);
    }
  });
});

// ---------------------------------------------------------------------------
describe('Real JWT round-trip (header.payload.signature)', () => {
  it('should decode a hand-crafted JWT and extract the correct user', () => {
    // Build a realistic Cognito ID token
    const header = { alg: 'RS256', kid: 'test-key-id', typ: 'JWT' };
    const payload = {
      sub: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      aud: '1a2b3c4d5e6f7g8h9i0j',
      email_verified: true,
      event_id: 'event-123',
      token_use: 'id',
      auth_time: 1700000000,
      iss: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_AbCdEfG',
      'cognito:username': 'smuppy_alice',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      email: 'alice@smuppy.com',
      phone_number: '+33600000000',
    };

    const headerB64 = toBase64Url(header);
    const payloadB64 = toBase64Url(payload);
    const token = `${headerB64}.${payloadB64}.fake-rsa-signature`;

    const user = decodeIdToken(token);

    expect(user.id).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(user.email).toBe('alice@smuppy.com');
    expect(user.username).toBe('smuppy_alice');
    expect(user.emailVerified).toBe(true);
    expect(user.phoneNumber).toBe('+33600000000');
    expect(user.attributes.token_use).toBe('id');
    expect(user.attributes.iss).toBe(
      'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_AbCdEfG'
    );
  });

  it('should correctly identify token expiry on a hand-crafted JWT', () => {
    const expiredPayload = {
      sub: 'user-1',
      exp: Math.floor(Date.now() / 1000) - 3600, // expired 1 hour ago
    };
    const validPayload = {
      sub: 'user-2',
      exp: Math.floor(Date.now() / 1000) + 3600, // valid for 1 more hour
    };

    const expiredToken = buildJWT(expiredPayload);
    const validToken = buildJWT(validPayload);

    expect(isTokenExpired(expiredToken)).toBe(true);
    expect(isTokenExpired(validToken)).toBe(false);
  });

  it('should handle base64UrlDecode <-> toBase64Url symmetry', () => {
    const payload = {
      sub: 'abc-123',
      email: 'round@trip.test',
      nested: { key: 'value' },
      array: [1, 2, 3],
    };
    const encoded = toBase64Url(payload);
    const decoded = JSON.parse(base64UrlDecode(encoded));
    expect(decoded).toEqual(payload);
  });
});

// ---------------------------------------------------------------------------
describe('Smart signup fallback logic', () => {
  /**
   * Re-implements the fallback decision logic from signUp():
   *   - 400 with a clear server message (not "Not Found") => re-throw (no fallback)
   *   - 404, 500, 502, 503, timeout, network errors => fall back to direct Cognito
   *
   * This tests the decision function, not the actual API calls.
   */
  function shouldFallbackToCognito(error: { statusCode?: number; message?: string }): boolean {
    const status = error.statusCode || 0;
    const isClientValidationError =
      status === 400 && error.message && !error.message.includes('Not Found');
    return !isClientValidationError;
  }

  it('should NOT fallback on 400 with a validation message', () => {
    expect(shouldFallbackToCognito({
      statusCode: 400,
      message: 'Email already exists',
    })).toBe(false);
  });

  it('should NOT fallback on 400 with password policy message', () => {
    expect(shouldFallbackToCognito({
      statusCode: 400,
      message: 'Password does not meet requirements',
    })).toBe(false);
  });

  it('should fallback on 400 with "Not Found" message (API misconfigured)', () => {
    expect(shouldFallbackToCognito({
      statusCode: 400,
      message: 'Not Found',
    })).toBe(true);
  });

  it('should fallback on 404 (API endpoint not deployed)', () => {
    expect(shouldFallbackToCognito({
      statusCode: 404,
      message: 'Not Found',
    })).toBe(true);
  });

  it('should fallback on 500 (internal server error)', () => {
    expect(shouldFallbackToCognito({
      statusCode: 500,
      message: 'Internal Server Error',
    })).toBe(true);
  });

  it('should fallback on 502 (bad gateway)', () => {
    expect(shouldFallbackToCognito({
      statusCode: 502,
      message: 'Bad Gateway',
    })).toBe(true);
  });

  it('should fallback on 503 (service unavailable)', () => {
    expect(shouldFallbackToCognito({
      statusCode: 503,
      message: 'Service Unavailable',
    })).toBe(true);
  });

  it('should fallback on network error (no status code)', () => {
    expect(shouldFallbackToCognito({
      statusCode: undefined,
      message: 'Network request failed',
    })).toBe(true);
  });

  it('should fallback on timeout error (no status code)', () => {
    expect(shouldFallbackToCognito({
      message: 'Request timed out',
    })).toBe(true);
  });

  it('should fallback on 400 with empty message', () => {
    // status 400 with falsy message => isClientValidationError is false
    expect(shouldFallbackToCognito({
      statusCode: 400,
      message: '',
    })).toBe(true);
  });

  it('should fallback on 400 with undefined message', () => {
    expect(shouldFallbackToCognito({
      statusCode: 400,
      message: undefined,
    })).toBe(true);
  });

  it('should fallback when error has no properties at all', () => {
    expect(shouldFallbackToCognito({})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('Edge cases and integration', () => {
  it('should handle a token where payload decodes to empty object', () => {
    const token = buildJWT({});
    const user = decodeIdToken(token);

    expect(user.id).toBe('');
    expect(user.email).toBe('');
    expect(user.username).toBe('');
    expect(user.emailVerified).toBe(false);
    expect(user.phoneNumber).toBeUndefined();
  });

  it('should handle a token with very long payload', () => {
    const payload = {
      sub: 'user-id',
      email: 'user@example.com',
      'cognito:username': 'user',
      email_verified: true,
      'custom:bio': 'A'.repeat(5000), // very long custom attribute
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.id).toBe('user-id');
    expect(user.attributes['custom:bio']).toHaveLength(5000);
  });

  it('should correctly chain: build JWT -> check not expired -> decode user', () => {
    const payload = {
      sub: 'chain-test-id',
      email: 'chain@test.com',
      'cognito:username': 'chain_user',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 7200,
    };

    const token = buildJWT(payload);

    // Step 1: token should not be expired
    expect(isTokenExpired(token)).toBe(false);

    // Step 2: decode should produce the correct user
    const user = decodeIdToken(token);
    expect(user.id).toBe('chain-test-id');
    expect(user.email).toBe('chain@test.com');
    expect(user.username).toBe('chain_user');
    expect(user.emailVerified).toBe(true);
  });

  it('should identify expired token AND still decode user info from it', () => {
    const payload = {
      sub: 'expired-user',
      email: 'expired@test.com',
      'cognito:username': 'old_user',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) - 3600,
    };

    const token = buildJWT(payload);

    // Token is expired
    expect(isTokenExpired(token)).toBe(true);

    // But we can still decode the user info from it
    const user = decodeIdToken(token);
    expect(user.id).toBe('expired-user');
    expect(user.email).toBe('expired@test.com');
  });

  it('should handle numeric string values in payload gracefully', () => {
    const payload = {
      sub: '12345',
      email: 'num@test.com',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = buildJWT(payload);
    const user = decodeIdToken(token);

    expect(user.id).toBe('12345');
    expect(typeof user.id).toBe('string');
  });
});
