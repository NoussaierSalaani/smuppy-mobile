/**
 * Logger Utility Unit Tests
 */

import { createLogger, getRequestId } from '../../utils/logger';

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

  describe('specialized logging methods', () => {
    it('should log requests', () => {
      const log = createLogger('test');
      log.logRequest('POST', '/api/users', { ip: '192.168.1.1' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('REQUEST');
      expect(logOutput.method).toBe('POST');
      expect(logOutput.path).toBe('/api/users');
    });

    it('should log responses with duration', () => {
      const log = createLogger('test');
      log.logResponse(200, 150);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('RESPONSE');
      expect(logOutput.statusCode).toBe(200);
      expect(logOutput.duration).toBe(150);
    });

    it('should log security events', () => {
      const log = createLogger('test');
      log.logSecurity('Invalid token', { ip: '1.2.3.4' });

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('SECURITY');
      expect(logOutput.level).toBe('WARN');
    });

    it('should log database queries', () => {
      const log = createLogger('test');
      log.logQuery('SELECT * FROM users', 50);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.type).toBe('DB_QUERY');
      expect(logOutput.duration).toBe(50);
    });

    it('should truncate long queries', () => {
      const log = createLogger('test');
      const longQuery = 'SELECT ' + 'x'.repeat(300) + ' FROM table';
      log.logQuery(longQuery, 100);

      const logOutput = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(logOutput.query.length).toBeLessThanOrEqual(203); // 200 + '...'
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
  });
});
