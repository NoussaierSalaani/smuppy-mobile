/**
 * Structured Logger for CloudWatch
 *
 * Provides consistent, structured logging for all Lambda handlers.
 * Logs are output in JSON format for easy parsing in CloudWatch Logs Insights.
 *
 * SECURITY:
 * - PII fields are automatically masked
 * - Error stack traces are included only in non-production
 * - Request IDs are tracked for correlation
 */

import { APIGatewayProxyEvent } from 'aws-lambda';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogContext {
  requestId?: string;
  userId?: string;
  sourceIp?: string;
  handler?: string;
  isColdStart?: boolean;
  [key: string]: unknown;
}

// Cold start detection — true only on the first invocation after container init
let _isColdStart = true;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
  [key: string]: unknown;
}

// PII fields to mask in logs
const PII_FIELDS = ['email', 'password', 'token', 'accessToken', 'refreshToken', 'idToken', 'phone', 'ssn'];

// Check if we're in production
const isProduction = process.env.ENVIRONMENT === 'production';

// Minimum log level based on environment
const MIN_LOG_LEVEL: Record<string, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentMinLevel = isProduction ? MIN_LOG_LEVEL.INFO : MIN_LOG_LEVEL.DEBUG;

/**
 * Mask sensitive data in objects
 */
function maskPII(obj: unknown, depth = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH]';

  if (obj == null) return obj;

  if (typeof obj === 'string') {
    // Strip zero-width characters that could be used to evade masking
    let cleaned = obj.replaceAll(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');

    // Mask email addresses — hide both local part and domain to prevent PII leakage
    cleaned = cleaned.replaceAll(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (match) => { // NOSONAR
      const atIndex = match.indexOf('@');
      const localPart = match.substring(0, Math.min(2, atIndex)) + '***';
      const domain = match.substring(atIndex + 1);
      const dotIndex = domain.lastIndexOf('.');
      const maskedDomain = domain.substring(0, Math.min(2, dotIndex)) + '***' + domain.substring(dotIndex);
      return localPart + '@' + maskedDomain;
    });

    // Mask phone numbers (international and local formats)
    cleaned = cleaned.replaceAll(/(?:\+?\d{1,4}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,6}/g, (match) => {
      // Only mask if it looks like a real phone number (7+ digits)
      const digits = match.replaceAll(/\D/g, '');
      if (digits.length >= 7) {
        return match.substring(0, 3) + '***' + match.substring(match.length - 2);
      }
      return match;
    });

    return cleaned;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => maskPII(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (PII_FIELDS.some(field => lowerKey.includes(field))) {
        masked[key] = '[REDACTED]';
      } else {
        masked[key] = maskPII(value, depth + 1);
      }
    }
    return masked;
  }

  return obj;
}

/**
 * Format error for logging
 */
function formatError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // Only include stack in non-production
      stack: isProduction ? undefined : error.stack,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    return {
      name: String(err.name || 'UnknownError'),
      message: String(err.message || JSON.stringify(error)),
      stack: isProduction ? undefined : String(err.stack || ''),
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}

/**
 * Write log entry to stdout (CloudWatch captures stdout)
 */
function writeLog(entry: LogEntry): void {
  // Check minimum log level
  if (MIN_LOG_LEVEL[entry.level] < currentMinLevel) return;

  // Mask PII in the entire entry
  const maskedEntry = maskPII(entry) as LogEntry;

  // Restore system-generated timestamp (not user input, must not be masked)
  maskedEntry.timestamp = entry.timestamp;

  // Output as JSON for CloudWatch Logs Insights
  console.log(JSON.stringify(maskedEntry));
}

/**
 * Logger class with context support
 */
class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  /**
   * Set request ID for correlation
   */
  setRequestId(requestId: string): void {
    this.context.requestId = requestId;
  }

  /**
   * Set user ID for the current request
   */
  setUserId(userId: string): void {
    this.context.userId = userId;
  }

  /**
   * Initialize logger context from an API Gateway event in a single call.
   * Extracts requestId, userId (from Cognito JWT), sourceIp, and cold start flag.
   * Call this once at the top of every handler.
   */
  initFromEvent(event: APIGatewayProxyEvent): void {
    this.context.requestId = event.requestContext?.requestId || `local-${Date.now()}`;
    const sub = event.requestContext?.authorizer?.claims?.sub;
    if (sub) this.context.userId = sub;
    this.context.sourceIp = event.requestContext?.identity?.sourceIp || undefined;
    this.context.isColdStart = _isColdStart;
    if (_isColdStart) _isColdStart = false;
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      ...data,
    };
    writeLog(entry);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('DEBUG', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('INFO', message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('WARN', message, data);
  }

  error(message: string, error?: unknown, data?: Record<string, unknown>): void {
    this.log('ERROR', message, {
      ...data,
      error: formatError(error),
    });
  }

  /**
   * Log API request start
   */
  logRequest(method: string, path: string, data?: Record<string, unknown>): void {
    this.info(`${method} ${path}`, {
      type: 'REQUEST',
      method,
      path,
      ...data,
    });
  }

  /**
   * Log API response
   */
  logResponse(statusCode: number, duration: number, data?: Record<string, unknown>): void {
    const level = statusCode >= 500 ? 'ERROR' : statusCode >= 400 ? 'WARN' : 'INFO';
    this.log(level, `Response ${statusCode}`, {
      type: 'RESPONSE',
      statusCode,
      duration,
      ...data,
    });
  }

  /**
   * Log database query
   */
  logQuery(query: string, duration: number, data?: Record<string, unknown>): void {
    // Truncate long queries
    const truncatedQuery = query.length > 200 ? query.substring(0, 200) + '...' : query;
    this.debug('Database query', {
      type: 'DB_QUERY',
      query: truncatedQuery,
      duration,
      ...data,
    });
  }

  /**
   * Log security event
   */
  logSecurity(event: string, data?: Record<string, unknown>): void {
    this.warn(`Security: ${event}`, {
      type: 'SECURITY',
      event,
      ...data,
    });
  }
}

/**
 * Create a logger instance for a handler
 */
export function createLogger(handler: string): Logger {
  return new Logger({ handler });
}

export type { Logger };

/**
 * Extract request ID from API Gateway event
 */
export function getRequestId(event: { requestContext?: { requestId?: string } }): string {
  return event.requestContext?.requestId || `local-${Date.now()}`;
}
