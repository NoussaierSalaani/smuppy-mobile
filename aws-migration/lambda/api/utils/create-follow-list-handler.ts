/**
 * Factory: Follow List Handler (followers / following)
 *
 * Eliminates duplication between followers.ts and following.ts.
 * The only structural difference is the JOIN direction:
 *   - followers: JOIN profiles p ON f.follower_id = p.id WHERE f.following_id = $1
 *   - following: JOIN profiles p ON f.following_id = p.id WHERE f.follower_id = $1
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool, SqlParam } from '../../shared/db';
import { createHeaders } from './cors';
import { createLogger } from './logger';
import { isValidUUID } from './security';
import { requireRateLimit } from './rate-limit';
import { checkPrivacyAccess } from './auth';
import { RATE_WINDOW_1_MIN } from './constants';
import { parseLimit, applyHasMore } from './pagination';
import { parseCursor, cursorToSql, generateCursor } from './cursor';

interface FollowListConfig {
  /** Logger name and rate limit prefix (e.g. 'profiles-followers') */
  loggerName: string;
  /**
   * Column to JOIN on (the profile column we SELECT).
   * - 'follower_id'  -> "get followers of X"  (JOIN p ON f.follower_id = p.id)
   * - 'following_id' -> "get following of X"   (JOIN p ON f.following_id = p.id)
   *
   * NOTE: These are compile-time constants from handler config, never user input.
   */
  joinColumn: 'follower_id' | 'following_id';
  /**
   * Column to filter on in WHERE (the target profile).
   * - 'following_id' -> WHERE f.following_id = $1 (for followers)
   * - 'follower_id'  -> WHERE f.follower_id = $1  (for following)
   *
   * NOTE: These are compile-time constants from handler config, never user input.
   */
  whereColumn: 'follower_id' | 'following_id';
  /** Response key for the list (e.g. 'followers' or 'following') */
  responseKey: string;
  /** Error log message (e.g. 'Error getting followers') */
  errorMessage: string;
}

export function createFollowListHandler(config: FollowListConfig) {
  const log = createLogger(config.loggerName);

  return async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    const headers = createHeaders(event);
    log.initFromEvent(event);

    try {
      const profileId = event.pathParameters?.id;
      if (!profileId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Profile ID is required' }),
        };
      }

      // Validate UUID format
      if (!isValidUUID(profileId)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid profile ID format' }),
        };
      }

      // Rate limit: anti-scraping — use IP for public endpoint
      const rateLimitId = event.requestContext.authorizer?.claims?.sub
        || event.requestContext.identity?.sourceIp || 'anonymous';
      const rateLimitResponse = await requireRateLimit({
        prefix: config.loggerName,
        identifier: rateLimitId,
        windowSeconds: RATE_WINDOW_1_MIN,
        maxRequests: 30,
        failOpen: true,
      }, headers);
      if (rateLimitResponse) return rateLimitResponse;

      // Pagination params
      const limit = parseLimit(event.queryStringParameters?.limit);
      const cursor = event.queryStringParameters?.cursor;

      const db = await getPool();

      // Check if profile exists
      const profileResult = await db.query(
        'SELECT id, username, is_private FROM profiles WHERE id = $1',
        [profileId]
      );

      if (profileResult.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ message: 'Profile not found' }),
        };
      }

      // Privacy check: if profile is private, only the owner or accepted followers can see the list
      if (profileResult.rows[0].is_private) {
        const cognitoSub = event.requestContext.authorizer?.claims?.sub;
        const hasAccess = await checkPrivacyAccess(db, profileId, cognitoSub);
        if (!hasAccess) {
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ message: 'This account is private' }),
          };
        }
      }

      // Build query - get list with total count via window function (saves a separate COUNT query)
      // NOTE: joinColumn and whereColumn are compile-time constants from handler config, not user input.
      let query = `
        SELECT
          p.id,
          p.username,
          p.full_name,
          p.avatar_url,
          p.bio,
          p.is_verified,
          p.account_type,
          p.business_name,
          p.display_name,
          p.cover_url,
          p.is_private,
          p.fan_count,
          p.following_count,
          p.post_count,
          f.created_at as followed_at,
          COUNT(*) OVER() as total_count
        FROM follows f
        JOIN profiles p ON f.${config.joinColumn} = p.id
        WHERE f.${config.whereColumn} = $1 AND f.status = 'accepted'
      `;

      const params: SqlParam[] = [profileId];
      let paramIndex = 2;

      // Cursor pagination
      const parsedCursor = parseCursor(cursor, 'timestamp-ms');
      if (parsedCursor) {
        const cursorSql = cursorToSql(parsedCursor, 'f.created_at', paramIndex);
        query += cursorSql.condition;
        params.push(...cursorSql.params);
        paramIndex += cursorSql.params.length;
      }

      query += ` ORDER BY f.created_at DESC LIMIT $${paramIndex}`;
      params.push(limit + 1);

      const result = await db.query(query, params);

      const { data: items, hasMore } = applyHasMore(result.rows, limit);
      const totalCount = result.rows.length > 0 ? Number.parseInt(result.rows[0].total_count as string, 10) : 0;

      // Format response
      const formattedItems = items.map((row: Record<string, unknown>) => ({
        id: row.id,
        username: row.username,
        fullName: row.full_name,
        avatarUrl: row.avatar_url,
        bio: row.bio,
        isVerified: !!row.is_verified,
        accountType: row.account_type,
        businessName: row.business_name,
        displayName: row.display_name || null,
        coverUrl: row.cover_url,
        isPrivate: !!row.is_private,
        followersCount: row.fan_count || 0,
        followingCount: row.following_count || 0,
        postsCount: row.post_count || 0,
        followedAt: row.followed_at,
      }));

      // Generate next cursor
      const nextCursor = hasMore && items.length > 0
        ? generateCursor('timestamp-ms', items.at(-1)! as Record<string, unknown>, 'followed_at')
        : null;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          [config.responseKey]: formattedItems,
          cursor: nextCursor,
          hasMore,
          totalCount,
        }),
      };
    } catch (error: unknown) {
      log.error(config.errorMessage, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}
