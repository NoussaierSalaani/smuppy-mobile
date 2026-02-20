/**
 * Business Handler Factory
 *
 * Eliminates boilerplate across business handlers by encapsulating:
 * headers -> log -> OPTIONS -> auth (getUserFromEvent) -> rate limit -> getPool -> delegate.
 *
 * Each handler provides its unique business logic via `onAction`.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Pool } from 'pg';
import { getPool } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger, Logger } from './logger';
import { requireRateLimit } from './rate-limit';
import { getUserFromEvent } from './auth';

// ── Types ────────────────────────────────────────────────────────────

interface AuthUser {
  id: string;
  sub: string;
  email?: string;
  username?: string;
}

interface BusinessHandlerContext {
  headers: Record<string, string>;
  user: AuthUser;
  db: Pool;
  event: APIGatewayProxyEvent;
  log: Logger;
}

interface BusinessHandlerConfig {
  /** Logger name for CloudWatch (e.g. 'business/services-create') */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'biz-svc-create') */
  rateLimitPrefix: string;
  /** Max requests per rate limit window */
  rateLimitMax: number;
  /** Rate limit window in seconds (default: 60) */
  rateLimitWindow?: number;
  /**
   * Skip auth check (for public endpoints like schedule-get, profile-get).
   * When true, `context.user` may be a dummy object; the handler should check itself.
   */
  skipAuth?: boolean;
  /**
   * Skip rate limiting (for endpoints that manage it differently or are public reads).
   */
  skipRateLimit?: boolean;
  /** The handler function that receives the authenticated context. */
  onAction: (context: BusinessHandlerContext) => Promise<APIGatewayProxyResult>;
}

// ── Factory ──────────────────────────────────────────────────────────

export function createBusinessHandler(config: BusinessHandlerConfig) {
  const {
    loggerName,
    rateLimitPrefix,
    rateLimitMax,
    rateLimitWindow = 60,
    skipAuth = false,
    skipRateLimit = false,
    onAction,
  } = config;

  const log: Logger = createLogger(loggerName);

  async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    // ── OPTIONS preflight ──────────────────────────────────────
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 204, headers, body: '' };
    }

    try {
      // ── Auth ────────────────────────────────────────────────────
      const user = getUserFromEvent(event);
      if (!skipAuth && !user) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ success: false, message: 'Unauthorized' }),
        };
      }

      // ── Rate limit ─────────────────────────────────────────────
      if (!skipRateLimit && user) {
        const rateLimitResponse = await requireRateLimit({
          prefix: rateLimitPrefix,
          identifier: user.id,
          maxRequests: rateLimitMax,
          windowSeconds: rateLimitWindow,
        }, headers);
        if (rateLimitResponse) return rateLimitResponse;
      }

      // ── DB ─────────────────────────────────────────────────────
      const db: Pool = await getPool();

      // ── Delegate ───────────────────────────────────────────────
      return await onAction({
        headers,
        user: user as AuthUser,
        db,
        event,
        log,
      });
    } catch (error: unknown) {
      log.error(`Error in ${loggerName}`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Internal server error' }),
      };
    }
  }

  return { handler };
}
