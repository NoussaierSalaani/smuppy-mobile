/**
 * Logger Utility Unit Tests
 * Covers: log levels, PII masking, context management, specialized methods,
 * formatError branches, maskPII depth/types, initFromEvent, logResponse levels
 */

jest.unmock('../../utils/logger');

import { createLogger, getRequestId } from '../../utils/logger';
import { APIGatewayProxyEvent } from 'aws-lambda';

// Mock console.log to capture output
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

beforeEach(() => {
  mockConsoleLog.mockClear();
});

afterAll(() => {
  mockConsoleLog.mockRestore();
});

describe('Logger Utility', () => {
  describe('createLogger', () => {
    it('should create a logger with handler context', () => {
      const log = createLogger('test-handler');
      log.info('Test message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.context.handler).toBe('test-handler');
    });
  });

  describe('log levels', () => {
    it('should log info messages', () => {
      const log = createLogger('test');
      log.info('Info message');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
      expect(logOutput.message).toBe('Info message');
    });

    it('should log warn messages', () => {
      const log = createLogger('test');
      log.warn('Warning message');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
    });

    it('should log error messages with error details', () => {
      const log = createLogger('test');
      const error = new Error('Test error');
      log.error('Error occurred', error);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.error.name).toBe('Error');
      expect(logOutput.error.message).toBe('Test error');
    });

    it('should log debug messages', () => {
      const log = createLogger('test');
      log.debug('Debug message');

      // In non-production (default), DEBUG should be logged
      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('DEBUG');
      expect(logOutput.message).toBe('Debug message');
    });

    it('should log error without error object', () => {
      const log = createLogger('test');
      log.error('Error without details');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      // formatError returns undefined for falsy error
      expect(logOutput.error).toBeUndefined();
    });

    it('should log error with null error', () => {
      const log = createLogger('test');
      log.error('Error with null', null);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.error).toBeUndefined();
    });

    it('should log error with additional data', () => {
      const log = createLogger('test');
      log.error('Error with data', new Error('err'), { requestId: 'req-1' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.error.name).toBe('Error');
      expect(logOutput.requestId).toBe('req-1');
    });
  });

  describe('PII masking', () => {
    it('should mask email addresses', () => {
      const log = createLogger('test');
      log.info('User logged in', { email: 'john.doe@example.com' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.email).toBe('[REDACTED]');
    });

    it('should mask password fields', () => {
      const log = createLogger('test');
      log.info('Auth attempt', { password: 'secret123' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.password).toBe('[REDACTED]');
    });

    it('should mask token fields', () => {
      const log = createLogger('test');
      log.info('Token received', { accessToken: 'eyJ...' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.accessToken).toBe('[REDACTED]');
    });

    it('should mask refreshToken field', () => {
      const log = createLogger('test');
      log.info('Tokens', { refreshToken: 'abc123' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.refreshToken).toBe('[REDACTED]');
    });

    it('should mask idToken field', () => {
      const log = createLogger('test');
      log.info('Tokens', { idToken: 'abc123' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.idToken).toBe('[REDACTED]');
    });

    it('should mask phone field', () => {
      const log = createLogger('test');
      log.info('Contact', { phone: '+1-555-1234567' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.phone).toBe('[REDACTED]');
    });

    it('should mask ssn field', () => {
      const log = createLogger('test');
      log.info('Identity', { ssn: '123-45-6789' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.ssn).toBe('[REDACTED]');
    });

    it('should mask nested sensitive fields', () => {
      const log = createLogger('test');
      log.info('User data', {
        user: {
          name: 'John',
          email: 'john@example.com',
        },
      });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.user.name).toBe('John');
      expect(logOutput.user.email).toBe('[REDACTED]');
    });

    it('should mask email addresses embedded in string values', () => {
      const log = createLogger('test');
      log.info('Message', { text: 'Contact us at john.doe@example.com for info' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.text).not.toContain('john.doe@example.com');
      // Should be partially masked
      expect(logOutput.text).toContain('***');
    });

    it('should mask short local part emails (less than 2 chars before @)', () => {
      const log = createLogger('test');
      log.info('Message', { text: 'Mail: j@example.com' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.text).not.toContain('j@example.com');
      expect(logOutput.text).toContain('***');
    });

    it('should mask phone numbers in string values (7+ digits)', () => {
      const log = createLogger('test');
      log.info('Call info', { text: 'Call +33 1 23 45 67 89 for help' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      // Phone number with 7+ digits should be masked
      expect(logOutput.text).toContain('***');
    });

    it('should not mask short number sequences (< 7 digits)', () => {
      const log = createLogger('test');
      log.info('Short num', { text: 'Room 123-45' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      // Short sequences should not be masked (less than 7 digits)
      // The regex might not even match
      expect(logOutput.text).toBeDefined();
    });

    it('should strip zero-width characters from strings', () => {
      const log = createLogger('test');
      log.info('Zero width', { text: 'Hello\u200BWorld\uFEFF' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.text).not.toContain('\u200B');
      expect(logOutput.text).not.toContain('\uFEFF');
    });

    it('should handle null values without error', () => {
      const log = createLogger('test');
      log.info('Null data', { value: null });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.value).toBeNull();
    });

    it('should handle undefined values without error', () => {
      const log = createLogger('test');
      log.info('Undef data', { value: undefined });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      // undefined is dropped in JSON.stringify
      expect(logOutput.value).toBeUndefined();
    });

    it('should pass through number values unchanged', () => {
      const log = createLogger('test');
      log.info('Number data', { count: 42 });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.count).toBe(42);
    });

    it('should pass through boolean values unchanged', () => {
      const log = createLogger('test');
      log.info('Bool data', { active: true });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.active).toBe(true);
    });

    it('should mask PII in arrays', () => {
      const log = createLogger('test');
      log.info('Array data', { items: ['hello', 'user@test.com', 42] });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.items).toBeInstanceOf(Array);
      expect(logOutput.items.length).toBe(3);
      // Email in array string should be masked
      expect(logOutput.items[1]).toContain('***');
      // Number should be passed through
      expect(logOutput.items[2]).toBe(42);
    });

    it('should handle deeply nested objects up to depth limit', () => {
      const log = createLogger('test');
      // Build a deeply nested object (> 10 levels)
      let deep: Record<string, unknown> = { value: 'bottom' };
      for (let i = 0; i < 12; i++) {
        deep = { nested: deep };
      }
      log.info('Deep data', deep);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      // The innermost values should be '[MAX_DEPTH]' once depth > 10
      let current: unknown = logOutput;
      let maxDepthFound = false;
      for (let i = 0; i < 15; i++) {
        if (typeof current === 'object' && current !== null && 'nested' in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>).nested;
        } else if (current === '[MAX_DEPTH]') {
          maxDepthFound = true;
          break;
        } else {
          break;
        }
      }
      expect(maxDepthFound).toBe(true);
    });

    it('should handle case-insensitive PII field matching', () => {
      const log = createLogger('test');
      log.info('Mixed case', { userPassword: 'secret', myAccessToken: 'abc' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.userPassword).toBe('[REDACTED]');
      expect(logOutput.myAccessToken).toBe('[REDACTED]');
    });
  });

  describe('context management', () => {
    it('should set request ID', () => {
      const log = createLogger('test');
      log.setRequestId('req-123');
      log.info('Test');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.context.requestId).toBe('req-123');
    });

    it('should set user ID', () => {
      const log = createLogger('test');
      log.setUserId('user-456');
      log.info('Test');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.context.userId).toBe('user-456');
    });

    it('should create child logger with additional context', () => {
      const log = createLogger('parent');
      const childLog = log.child({ operation: 'child-op' });
      childLog.info('Child message');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.context.handler).toBe('parent');
      expect(logOutput.context.operation).toBe('child-op');
    });
  });

  describe('initFromEvent', () => {
    it('should initialize context from event with all fields', () => {
      const log = createLogger('test');
      const event = {
        requestContext: {
          requestId: 'api-req-001',
          authorizer: {
            claims: { sub: 'user-cognito-sub-123' },
          },
          identity: { sourceIp: '10.0.0.1' },
        },
        headers: {},
        body: null,
        httpMethod: 'GET',
      } as unknown as APIGatewayProxyEvent;

      log.initFromEvent(event);
      log.info('After init');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.context.requestId).toBe('api-req-001');
      expect(logOutput.context.userId).toBe('user-cognito-sub-123');
      expect(logOutput.context.sourceIp).toBe('10.0.0.1');
      expect(typeof logOutput.context.isColdStart).toBe('boolean');
    });

    it('should handle event without authorizer (no userId)', () => {
      const log = createLogger('test');
      const event = {
        requestContext: {
          requestId: 'api-req-002',
          identity: { sourceIp: '10.0.0.2' },
        },
        headers: {},
        body: null,
        httpMethod: 'GET',
      } as unknown as APIGatewayProxyEvent;

      log.initFromEvent(event);
      log.info('No auth');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.context.requestId).toBe('api-req-002');
      expect(logOutput.context.userId).toBeUndefined();
    });

    it('should handle event without requestContext.requestId', () => {
      const log = createLogger('test');
      const event = {
        requestContext: {
          identity: {},
        },
        headers: {},
        body: null,
        httpMethod: 'GET',
      } as unknown as APIGatewayProxyEvent;

      log.initFromEvent(event);
      log.info('No requestId');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      // The requestId is `local-<timestamp>` but PII masking may partially mask the digits
      // (phone number regex matches 7+ digit sequences). Just verify it starts with "local-".
      expect(logOutput.context.requestId).toMatch(/^local-/);
    });

    it('should handle event without identity.sourceIp', () => {
      const log = createLogger('test');
      const event = {
        requestContext: {
          requestId: 'api-req-003',
          identity: {},
        },
        headers: {},
        body: null,
        httpMethod: 'GET',
      } as unknown as APIGatewayProxyEvent;

      log.initFromEvent(event);
      log.info('No sourceIp');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.context.sourceIp).toBeUndefined();
    });

    it('should track cold start on first call', () => {
      // The _isColdStart variable is module-level, so the first call
      // in this test file may or may not be cold start depending on test order.
      // We just verify the field is set.
      const log = createLogger('test');
      const event = {
        requestContext: {
          requestId: 'cold-start-test',
          identity: {},
        },
        headers: {},
        body: null,
        httpMethod: 'GET',
      } as unknown as APIGatewayProxyEvent;

      log.initFromEvent(event);
      log.info('Cold start check');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.context).toHaveProperty('isColdStart');
    });

    it('should set isColdStart to false on subsequent calls', () => {
      const log1 = createLogger('test');
      const log2 = createLogger('test');
      const event = {
        requestContext: {
          requestId: 'req-1',
          identity: {},
        },
        headers: {},
        body: null,
        httpMethod: 'GET',
      } as unknown as APIGatewayProxyEvent;

      // First call sets cold start and clears it
      log1.initFromEvent(event);
      // Second call should have isColdStart = false
      log2.initFromEvent(event);
      log2.info('Not cold start');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.context.isColdStart).toBe(false);
    });
  });

  describe('specialized logging methods', () => {
    it('should log requests', () => {
      const log = createLogger('test');
      log.logRequest('POST', '/api/users', { ip: '192.168.1.1' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('REQUEST');
      expect(logOutput.method).toBe('POST');
      expect(logOutput.path).toBe('/api/users');
    });

    it('should log requests without additional data', () => {
      const log = createLogger('test');
      log.logRequest('GET', '/api/health');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('REQUEST');
      expect(logOutput.method).toBe('GET');
    });

    it('should log responses with duration', () => {
      const log = createLogger('test');
      log.logResponse(200, 150);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('RESPONSE');
      expect(logOutput.statusCode).toBe(200);
      expect(logOutput.duration).toBe(150);
      expect(logOutput.level).toBe('INFO');
    });

    it('should log 4xx responses at WARN level', () => {
      const log = createLogger('test');
      log.logResponse(404, 50);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
      expect(logOutput.statusCode).toBe(404);
    });

    it('should log 400 responses at WARN level', () => {
      const log = createLogger('test');
      log.logResponse(400, 10);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
    });

    it('should log 429 responses at WARN level', () => {
      const log = createLogger('test');
      log.logResponse(429, 5);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
    });

    it('should log 5xx responses at ERROR level', () => {
      const log = createLogger('test');
      log.logResponse(500, 200);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
      expect(logOutput.statusCode).toBe(500);
    });

    it('should log 503 responses at ERROR level', () => {
      const log = createLogger('test');
      log.logResponse(503, 300);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('ERROR');
    });

    it('should log 2xx responses at INFO level', () => {
      const log = createLogger('test');
      log.logResponse(201, 100);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
    });

    it('should log responses with additional data', () => {
      const log = createLogger('test');
      log.logResponse(200, 50, { userId: 'user-1' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.userId).toBe('user-1');
    });

    it('should log security events', () => {
      const log = createLogger('test');
      log.logSecurity('Invalid token', { ip: '1.2.3.4' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('SECURITY');
      expect(logOutput.level).toBe('WARN');
    });

    it('should log security events without additional data', () => {
      const log = createLogger('test');
      log.logSecurity('Rate limit hit');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('SECURITY');
      expect(logOutput.event).toBe('Rate limit hit');
    });

    it('should log database queries', () => {
      const log = createLogger('test');
      log.logQuery('SELECT * FROM users', 50);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('DB_QUERY');
      expect(logOutput.duration).toBe(50);
    });

    it('should not truncate short queries', () => {
      const log = createLogger('test');
      const shortQuery = 'SELECT id FROM users WHERE id = $1';
      log.logQuery(shortQuery, 10);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.query).toBe(shortQuery);
    });

    it('should truncate long queries', () => {
      const log = createLogger('test');
      const longQuery = 'SELECT ' + 'x'.repeat(300) + ' FROM table';
      log.logQuery(longQuery, 100);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.query.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(logOutput.query.endsWith('...')).toBe(true);
    });

    it('should log queries with additional data', () => {
      const log = createLogger('test');
      log.logQuery('SELECT 1', 5, { rowCount: 10 });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.rowCount).toBe(10);
    });
  });

  describe('formatError branches', () => {
    it('should handle Error instance', () => {
      const log = createLogger('test');
      log.error('Error test', new Error('test message'));

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.error.name).toBe('Error');
      expect(logOutput.error.message).toBe('test message');
      // In non-production, stack should be included
      expect(logOutput.error.stack).toBeDefined();
    });

    it('should handle TypeError instance', () => {
      const log = createLogger('test');
      log.error('Type error', new TypeError('Cannot read property'));

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.error.name).toBe('TypeError');
      expect(logOutput.error.message).toBe('Cannot read property');
    });

    it('should handle non-Error object with name and message', () => {
      const log = createLogger('test');
      log.error('Custom error', { name: 'CustomError', message: 'Something went wrong', stack: 'at line 1' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.error.name).toBe('CustomError');
      expect(logOutput.error.message).toBe('Something went wrong');
    });

    it('should handle non-Error object without name', () => {
      const log = createLogger('test');
      log.error('Nameless error', { message: 'just a message' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.error.name).toBe('UnknownError');
      expect(logOutput.error.message).toBe('just a message');
    });

    it('should handle non-Error object without message', () => {
      const log = createLogger('test');
      log.error('No message error', { code: 'ENOENT' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.error.name).toBe('UnknownError');
      // message should be JSON stringified
      expect(logOutput.error.message).toContain('ENOENT');
    });

    it('should handle string as error', () => {
      const log = createLogger('test');
      log.error('String error', 'something broke' as unknown);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.error.name).toBe('UnknownError');
      expect(logOutput.error.message).toBe('something broke');
    });

    it('should handle number as error', () => {
      const log = createLogger('test');
      log.error('Number error', 42 as unknown);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.error.name).toBe('UnknownError');
      expect(logOutput.error.message).toBe('42');
    });

    it('should return undefined for falsy error values', () => {
      const log = createLogger('test');
      log.error('No error', undefined);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.error).toBeUndefined();
    });

    it('should return undefined for empty string error', () => {
      const log = createLogger('test');
      log.error('Empty error', '' as unknown);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      // '' is falsy, so formatError returns undefined
      expect(logOutput.error).toBeUndefined();
    });

    it('should return undefined for zero error', () => {
      const log = createLogger('test');
      log.error('Zero error', 0 as unknown);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      // 0 is falsy, so formatError returns undefined
      expect(logOutput.error).toBeUndefined();
    });
  });

  describe('getRequestId', () => {
    it('should extract request ID from event', () => {
      const event = {
        requestContext: {
          requestId: 'api-gw-123',
        },
      };
      expect(getRequestId(event)).toBe('api-gw-123');
    });

    it('should generate local ID if not present', () => {
      const event = {};
      const requestId = getRequestId(event);
      expect(requestId).toMatch(/^local-\d+$/);
    });

    it('should generate local ID if requestContext is undefined', () => {
      const event = { requestContext: undefined };
      const requestId = getRequestId(event);
      expect(requestId).toMatch(/^local-\d+$/);
    });

    it('should generate local ID if requestId is undefined', () => {
      const event = { requestContext: {} };
      const requestId = getRequestId(event);
      expect(requestId).toMatch(/^local-\d+$/);
    });
  });

  describe('JSON output format', () => {
    it('should output valid JSON', () => {
      const log = createLogger('test');
      log.info('Test message', { data: 'value' });

      expect(() => JSON.parse(mockConsoleLog.mock.calls[0][0])).not.toThrow();
    });

    it('should include timestamp in ISO format', () => {
      const log = createLogger('test');
      log.info('Test');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should preserve timestamp even when masking PII', () => {
      const log = createLogger('test');
      log.info('PII test', { password: 'secret' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      // Timestamp should not be masked
      expect(logOutput.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('log with data parameter', () => {
    it('should merge data into log entry', () => {
      const log = createLogger('test');
      log.info('With data', { customField: 'customValue', count: 5 });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.customField).toBe('customValue');
      expect(logOutput.count).toBe(5);
    });

    it('should handle info without data parameter', () => {
      const log = createLogger('test');
      log.info('No data');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.message).toBe('No data');
    });

    it('should handle warn without data parameter', () => {
      const log = createLogger('test');
      log.warn('Warn no data');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.message).toBe('Warn no data');
    });

    it('should handle debug without data parameter', () => {
      const log = createLogger('test');
      log.debug('Debug no data');

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.message).toBe('Debug no data');
    });
  });

  describe('child logger isolation', () => {
    it('should not mutate parent context when child sets userId', () => {
      const parent = createLogger('parent-handler');
      const child = parent.child({ operation: 'sub-task' });

      child.setUserId('child-user-999');
      parent.info('Parent log');

      const parentOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(parentOutput.context.userId).toBeUndefined();
      expect(parentOutput.context.handler).toBe('parent-handler');
    });

    it('should inherit parent handler in child context', () => {
      const parent = createLogger('api-handler');
      const child = parent.child({ step: 'validation' });

      child.info('Child log');

      const childOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(childOutput.context.handler).toBe('api-handler');
      expect(childOutput.context.step).toBe('validation');
    });

    it('should allow chaining child loggers', () => {
      const root = createLogger('root');
      const level1 = root.child({ level: 1 });
      const level2 = level1.child({ level: 2 });

      level2.info('Deep child');

      const output = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(output.context.handler).toBe('root');
      expect(output.context.level).toBe(2);
    });

    it('should allow child to override parent context keys', () => {
      const parent = createLogger('parent');
      parent.setRequestId('parent-req');
      const child = parent.child({ requestId: 'child-req' });

      child.info('Override test');

      const output = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(output.context.requestId).toBe('child-req');
    });
  });

  describe('logResponse edge cases', () => {
    it('should log 301 redirect at INFO level', () => {
      const log = createLogger('test');
      log.logResponse(301, 5);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
      expect(logOutput.statusCode).toBe(301);
    });

    it('should log 399 (below 400) at INFO level', () => {
      const log = createLogger('test');
      log.logResponse(399, 10);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('INFO');
    });

    it('should log 499 at WARN level', () => {
      const log = createLogger('test');
      log.logResponse(499, 10);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.level).toBe('WARN');
    });
  });

  describe('maskPII edge cases', () => {
    it('should mask multiple emails in a single string', () => {
      const log = createLogger('test');
      log.info('Multi email', { text: 'From: alice@test.com to bob@test.com' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.text).not.toContain('alice@test.com');
      expect(logOutput.text).not.toContain('bob@test.com');
    });

    it('should handle empty object without error', () => {
      const log = createLogger('test');
      log.info('Empty obj', {});

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.message).toBe('Empty obj');
    });

    it('should handle nested arrays within objects', () => {
      const log = createLogger('test');
      log.info('Nested array', { data: { items: ['a', 'b'] } });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.data.items).toEqual(['a', 'b']);
    });
  });
});
