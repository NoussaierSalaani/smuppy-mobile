/**
 * Create Live Battle Lambda Handler
 * Start a live battle with other creators
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { v4 as uuidv4 } from 'uuid';
import { cors, handleOptions } from '../utils/cors';
import { isValidUUID, sanitizeInput } from '../utils/security';
import { checkRateLimit } from '../utils/rate-limit';
import { createLogger } from '../utils/logger';
import { requireActiveAccount, isAccountError } from '../utils/account-status';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';

interface CreateBattleRequest {
  title?: string;
  description?: string;
  battleType?: 'tips' | 'votes' | 'challenge';
  maxParticipants?: number;
  durationMinutes?: number;
  scheduledAt?: string;
  invitedUserIds: string[];
}

const log = createLogger('battles-create');

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const pool = await getPool();
  const client = await pool.connect();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const { allowed } = await checkRateLimit({ prefix: 'battle-create', identifier: userId, windowSeconds: 60, maxRequests: 3 });
    if (!allowed) {
      return cors({ statusCode: 429, body: JSON.stringify({ success: false, message: 'Too many requests. Please try again later.' }) });
    }

    // Account status check (suspended/banned users cannot create battles)
    const accountCheck = await requireActiveAccount(userId, {});
    if (isAccountError(accountCheck)) {
      return cors({ statusCode: accountCheck.statusCode, body: accountCheck.body });
    }

    // Resolve cognito_sub to profile ID
    const profileResult = await client.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Profile not found' }),
      });
    }
    const profileId = profileResult.rows[0].id;

    const body: CreateBattleRequest = JSON.parse(event.body || '{}');
    const {
      title,
      description,
      battleType = 'tips',
      maxParticipants = 2,
      durationMinutes = 10,
      scheduledAt,
      invitedUserIds,
    } = body;

    // Validate battleType at runtime (TypeScript types are erased)
    const VALID_BATTLE_TYPES = ['tips', 'votes', 'challenge'] as const;
    if (!VALID_BATTLE_TYPES.includes(battleType as typeof VALID_BATTLE_TYPES[number])) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid battle type' }),
      });
    }

    // Validate bounds
    if (maxParticipants < 2 || maxParticipants > 10) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'maxParticipants must be between 2 and 10' }),
      });
    }
    if (durationMinutes < 1 || durationMinutes > 120) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'durationMinutes must be between 1 and 120' }),
      });
    }

    // Sanitize text fields
    const sanitizedTitle = title ? sanitizeInput(title, 200) : undefined;
    const sanitizedDescription = description ? sanitizeInput(description, 2000) : undefined;

    // Moderation: check title and description for violations
    const textsToCheck = [sanitizedTitle, sanitizedDescription].filter(Boolean) as string[];
    for (const text of textsToCheck) {
      const filterResult = await filterText(text);
      if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
        log.warn('Battle text blocked by filter', { userId: userId.substring(0, 8) + '***', severity: filterResult.severity });
        return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }) });
      }
      const toxicityResult = await analyzeTextToxicity(text);
      if (toxicityResult.action === 'block') {
        log.warn('Battle text blocked by toxicity', { userId: userId.substring(0, 8) + '***', category: toxicityResult.topCategory });
        return cors({ statusCode: 400, body: JSON.stringify({ success: false, message: 'Your content contains text that violates our community guidelines.' }) });
      }
    }

    if (!invitedUserIds || invitedUserIds.length === 0) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'At least one opponent must be invited',
        }),
      });
    }

    if (!invitedUserIds.every(isValidUUID)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid ID format' }),
      });
    }

    if (invitedUserIds.length > maxParticipants - 1) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: `Maximum ${maxParticipants} participants allowed`,
        }),
      });
    }

    // Verify host is a creator
    const hostResult = await client.query(
      `SELECT id, username, display_name, avatar_url, account_type, is_verified, business_name
       FROM profiles WHERE id = $1`,
      [profileId]
    );

    if (hostResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'User not found' }),
      });
    }

    const host = hostResult.rows[0];
    if (host.account_type !== 'pro_creator' && host.account_type !== 'pro_business') {
      return cors({
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: 'Only creators can host battles',
        }),
      });
    }

    // Verify all invited users are creators
    const invitedResult = await client.query(
      `SELECT id, username, display_name, avatar_url, account_type, is_verified, business_name
       FROM profiles
       WHERE id = ANY($1)
       AND (account_type = 'pro_creator' OR account_type = 'pro_business')`,
      [invitedUserIds]
    );

    if (invitedResult.rows.length !== invitedUserIds.length) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({
          success: false,
          message: 'All invited users must be creators',
        }),
      });
    }

    await client.query('BEGIN');

    // Generate unique Agora channel name
    const agoraChannelName = `battle_${uuidv4().substring(0, 8)}`;

    // Create battle
    const battleResult = await client.query(
      `INSERT INTO live_battles (
        host_id, title, description, battle_type, max_participants,
        duration_minutes, scheduled_at, agora_channel_name, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'invited')
      RETURNING id, title, description, battle_type, max_participants, duration_minutes, scheduled_at, agora_channel_name, status, created_at`,
      [
        profileId,
        sanitizedTitle || `${host.display_name}'s Battle`,
        sanitizedDescription,
        battleType,
        maxParticipants,
        durationMinutes,
        scheduledAt ? new Date(scheduledAt) : null,
        agoraChannelName,
      ]
    );

    const battle = battleResult.rows[0];

    // Add host as participant (position 1)
    await client.query(
      `INSERT INTO battle_participants (
        battle_id, user_id, status, position, accepted_at
      ) VALUES ($1, $2, 'accepted', 1, NOW())`,
      [battle.id, profileId]
    );

    // Invite other participants
    const participants = [
      {
        ...host,
        position: 1,
        status: 'accepted',
        isHost: true,
      },
    ];

    for (let i = 0; i < invitedResult.rows.length; i++) {
      const invited = invitedResult.rows[i];

      await client.query(
        `INSERT INTO battle_participants (
          battle_id, user_id, status, position
        ) VALUES ($1, $2, 'invited', $3)`,
        [battle.id, invited.id, i + 2]
      );

      // Send notification
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body, data)
         VALUES ($1, 'battle_invite', 'Battle Invitation', $2, $3)`,
        [
          invited.id,
          `${host.display_name} invited you to a live battle!`,
          JSON.stringify({
            battleId: battle.id,
            title: battle.title,
            battleType,
            scheduledAt: battle.scheduled_at,
            senderId: profileId,
          }),
        ]
      );

      participants.push({
        ...invited,
        position: i + 2,
        status: 'invited',
        isHost: false,
      });
    }

    await client.query('COMMIT');

    return cors({
      statusCode: 201,
      body: JSON.stringify({
        success: true,
        battle: {
          id: battle.id,
          title: battle.title,
          description: battle.description,
          battleType: battle.battle_type,
          maxParticipants: battle.max_participants,
          durationMinutes: battle.duration_minutes,
          scheduledAt: battle.scheduled_at,
          agoraChannelName: battle.agora_channel_name,
          status: battle.status,
          createdAt: battle.created_at,
          host: {
            id: host.id,
            username: host.username,
            displayName: host.display_name,
            avatarUrl: host.avatar_url,
            isVerified: host.is_verified,
            accountType: host.account_type,
            businessName: host.business_name,
          },
          participants: participants.map((p) => ({
            id: p.id,
            username: p.username,
            displayName: p.display_name,
            avatarUrl: p.avatar_url,
            isVerified: p.is_verified,
            accountType: p.account_type,
            businessName: p.business_name,
            position: p.position,
            status: p.status,
            isHost: p.isHost,
          })),
        },
      }),
    });
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    log.error('Create battle error:', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to create battle',
      }),
    });
  } finally {
    client.release();
  }
};
