/**
 * Authenticated Handler Wrapper
 *
 * Composes withErrorHandler + auth extraction + profile resolution.
 * Eliminates the repeated 5-line auth boilerplate in ~50 handlers:
 *   cognitoSub extraction → 401 check → getPool → resolveProfileId → 404 check
 *
 * Usage:
 * ```ts
 * export const handler = withAuthHandler('posts-create', async (event, { headers, log, cognitoSub, profileId, db }) => {
 *   // Business logic directly — no auth boilerplate
 * });
 * ```
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { Pool } from 'pg';
import { withErrorHandler } from './error-handler';
import { resolveProfileId } from './auth';
import { getPool } from '../services/database';
import type { Logger } from './logger';

export interface AuthContext {
  headers: Record<string, string>;
  log: Logger;
  cognitoSub: string;
  profileId: string;
  db: Pool;
}

export function withAuthHandler(
  name: string,
  fn: (event: APIGatewayProxyEvent, ctx: AuthContext) => Promise<APIGatewayProxyResult>,
): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return withErrorHandler(name, async (event, { headers, log }) => {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ message: 'Unauthorized' }) };
    }

    const db = await getPool();
    const profileId = await resolveProfileId(db, cognitoSub);
    if (!profileId) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Profile not found' }) };
    }

    return fn(event, { headers, log, cognitoSub, profileId, db });
  });
}
