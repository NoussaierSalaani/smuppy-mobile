/**
 * Follow User Lambda Handler
 * Creates a follow relationship between users
 * Handles both public and private accounts
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);

  try {
    const followerId = event.requestContext.authorizer?.claims?.sub;

    if (!followerId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized' }),
      };
    }

    const body = JSON.parse(event.body || '{}');
    const followingId = body.followingId;

    if (!followingId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'followingId is required' }),
      };
    }

    if (followerId === followingId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Cannot follow yourself' }),
      };
    }

    const db = await getPool();

    // Check if target user exists and if they're private
    const targetResult = await db.query(
      `SELECT id, is_private FROM profiles WHERE id = $1`,
      [followingId]
    );

    if (targetResult.rows.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'User not found' }),
      };
    }

    const targetUser = targetResult.rows[0];

    // Check if already following or pending
    const existingResult = await db.query(
      `SELECT id, status FROM follows WHERE follower_id = $1 AND following_id = $2`,
      [followerId, followingId]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      if (existing.status === 'accepted') {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            type: 'already_following',
            message: 'Already following this user',
          }),
        };
      } else if (existing.status === 'pending') {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            type: 'already_requested',
            message: 'Follow request already pending',
          }),
        };
      }
    }

    const followId = uuidv4();
    const status = targetUser.is_private ? 'pending' : 'accepted';

    // Create follow record
    await db.query(
      `INSERT INTO follows (id, follower_id, following_id, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [followId, followerId, followingId, status]
    );

    // Update follower counts if accepted
    if (status === 'accepted') {
      await Promise.all([
        db.query(
          `UPDATE profiles SET fan_count = COALESCE(fan_count, 0) + 1 WHERE id = $1`,
          [followingId]
        ),
        db.query(
          `UPDATE profiles SET following_count = COALESCE(following_count, 0) + 1 WHERE id = $1`,
          [followerId]
        ),
      ]);

      // Create notification for new follower
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
         VALUES ($1, $2, 'new_follower', 'New Follower', 'Someone started following you', $3, NOW())`,
        [uuidv4(), followingId, JSON.stringify({ followerId })]
      );
    } else {
      // Create notification for follow request
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
         VALUES ($1, $2, 'follow_request', 'Follow Request', 'Someone wants to follow you', $3, NOW())`,
        [uuidv4(), followingId, JSON.stringify({ requesterId: followerId })]
      );
    }

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        type: status === 'accepted' ? 'followed' : 'request_created',
        message: status === 'accepted' ? 'Successfully followed user' : 'Follow request sent',
      }),
    };
  } catch (error: any) {
    console.error('Error creating follow:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Internal server error' }),
    };
  }
}
