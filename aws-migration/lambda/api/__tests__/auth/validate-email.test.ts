/**
 * Validate Email Handler Tests
 * Tests for email format, domain, MX record, typo, and disposable validation
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// Set env vars before imports
process.env.USER_POOL_ID = 'us-east-1_TestPool';
process.env.CLIENT_ID = 'test-client-id';

// Mock dns module
const mockResolveMx = jest.fn();
jest.mock('dns', () => ({
  resolveMx: mockResolveMx,
}));

jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
  getRequestId: jest.fn().mockReturnValue('test-request-id'),
}));

jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
}));

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: { 'X-Forwarded-For': '1.2.3.4' },
    body: overrides.body as string ?? null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/auth/validate-email',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub ? { claims: { sub: overrides.sub } } : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('Validate Email Handler', () => {
  let handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;
  let checkRateLimit: jest.Mock;

  beforeAll(async () => {
    checkRateLimit = (await import('../../utils/rate-limit')).checkRateLimit as jest.Mock;
    const module = await import('../../auth/validate-email');
    handler = module.handler;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    checkRateLimit.mockResolvedValue({ allowed: true });
    // Default: MX records exist. The handler uses promisify(dns.resolveMx), so
    // mockResolveMx receives (domain, callback). promisify converts it to a promise.
    // We mock the callback-based function:
    mockResolveMx.mockImplementation((_domain: string, cb: (err: Error | null, records?: Array<{ exchange: string; priority: number }>) => void) => {
      cb(null, [{ exchange: 'mx.example.com', priority: 10 }]);
    });
  });

  describe('Rate Limiting', () => {
    it('should return 429 when rate limited', async () => {
      checkRateLimit.mockResolvedValue({ allowed: false, retryAfter: 60 });

      const event = makeEvent({
        body: JSON.stringify({ email: 'test@example.com' }),
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.error).toContain('Too many requests');
    });
  });

  describe('Input Validation', () => {
    it('should return 400 when body is missing', async () => {
      const event = makeEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.error).toContain('Missing request body');
    });

    it('should return 400 when email is missing', async () => {
      const event = makeEvent({ body: JSON.stringify({}) });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.error).toContain('Email is required');
    });
  });

  describe('Format Validation', () => {
    it('should reject email without @ sign', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'invalidemail' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.error).toContain('Invalid email format');
      expect(body.details.formatValid).toBe(false);
    });

    it('should reject email with multiple @ signs', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@@example.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
    });

    it('should reject email with invalid characters', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user name@example.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.details.formatValid).toBe(false);
    });
  });

  describe('Domain Typo Detection', () => {
    it('should detect gmail.co typo and suggest gmail.com', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@gmail.co' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.suggestion).toBe('user@gmail.com');
      expect(body.details.isTypo).toBe(true);
    });

    it('should detect hotmail.con typo', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@hotmail.con' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.suggestion).toBe('user@hotmail.com');
      expect(body.details.isTypo).toBe(true);
    });

    it('should detect gmai.com typo', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@gmai.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.suggestion).toBe('user@gmail.com');
    });

    it('should detect yahoo.co typo', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@yahoo.co' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.suggestion).toBe('user@yahoo.com');
    });

    it('should detect icloud.con typo', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@icloud.con' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.suggestion).toBe('user@icloud.com');
    });

    it('should detect outlook.co typo', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@outlook.co' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.suggestion).toBe('user@outlook.com');
    });
  });

  describe('Disposable Email Detection', () => {
    it('should reject mailinator.com as disposable', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@mailinator.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.error).toContain('Temporary email addresses are not allowed');
      expect(body.details.isDisposable).toBe(true);
    });

    it('should reject yopmail.com as disposable', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@yopmail.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.details.isDisposable).toBe(true);
    });

    it('should reject tempmail.com as disposable', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@tempmail.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.details.isDisposable).toBe(true);
    });
  });

  describe('MX Record Verification', () => {
    it('should reject domain with no MX records', async () => {
      mockResolveMx.mockImplementation((_domain: string, cb: (err: Error | null, records?: unknown[]) => void) => {
        cb(new Error('ENOTFOUND'));
      });

      const event = makeEvent({ body: JSON.stringify({ email: 'user@nonexistentdomain12345.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.error).toContain('cannot receive emails');
      expect(body.details.mxRecordsExist).toBe(false);
    });
  });

  describe('Happy Path — Valid Email', () => {
    it('should return valid for a correct email with MX records', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'user@example.com' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
      expect(body.email).toBe('user@example.com');
      expect(body.details.formatValid).toBe(true);
      expect(body.details.domainExists).toBe(true);
      expect(body.details.mxRecordsExist).toBe(true);
      expect(body.details.isDisposable).toBe(false);
      expect(body.details.isTypo).toBe(false);
    });

    it('should normalize email to lowercase', async () => {
      const event = makeEvent({ body: JSON.stringify({ email: 'User@Example.COM' }) });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(true);
      expect(body.email).toBe('user@example.com');
    });
  });

  describe('Generic Error', () => {
    it('should return 500 on unexpected error', async () => {
      // Force an error by making JSON.parse fail (body is not valid JSON)
      const event = makeEvent({ body: '{invalid-json' });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.valid).toBe(false);
      expect(body.error).toContain('Validation failed');
    });
  });

  describe('Response Headers', () => {
    it('should include CORS headers', async () => {
      const event = makeEvent();
      const response = await handler(event);

      expect(response.headers).toBeDefined();
      expect(response.headers!['Content-Type']).toBe('application/json');
      expect(response.headers!['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});
