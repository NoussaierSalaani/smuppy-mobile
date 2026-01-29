/**
 * Join Battle Lambda Handler
 * Accept invitation and join a battle / Start streaming
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { RtcTokenBuilder, RtcRole } from 'agora-access-token';
import { cors, handleOptions } from '../utils/cors';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: process.env.NODE_ENV !== 'development' },
});

const AGORA_APP_ID = process.env.AGORA_APP_ID!;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE!;

interface JoinBattleRequest {
  action: 'accept' | 'decline' | 'start' | 'leave';
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const client = await pool.connect();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;
    if (!userId) {
      return cors({
        statusCode: 401,
        body: JSON.stringify({ success: false, message: 'Unauthorized' }),
      });
    }

    const battleId = event.pathParameters?.battleId;
    if (!battleId) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Battle ID required' }),
      });
    }

    const body: JoinBattleRequest = JSON.parse(event.body || '{}');
    const { action } = body;

    if (!['accept', 'decline', 'start', 'leave'].includes(action)) {
      return cors({
        statusCode: 400,
        body: JSON.stringify({ success: false, message: 'Invalid action' }),
      });
    }

    // Get battle details
    const battleResult = await client.query(
      `SELECT * FROM live_battles WHERE id = $1`,
      [battleId]
    );

    if (battleResult.rows.length === 0) {
      return cors({
        statusCode: 404,
        body: JSON.stringify({ success: false, message: 'Battle not found' }),
      });
    }

    const battle = battleResult.rows[0];

    // Get participant record
    const participantResult = await client.query(
      `SELECT * FROM battle_participants
       WHERE battle_id = $1 AND user_id = $2`,
      [battleId, userId]
    );

    if (participantResult.rows.length === 0) {
      return cors({
        statusCode: 403,
        body: JSON.stringify({
          success: false,
          message: 'You are not a participant in this battle',
        }),
      });
    }

    const participant = participantResult.rows[0];

    await client.query('BEGIN');

    let agoraToken: string | null = null;
    let response: any = { success: true };

    switch (action) {
      case 'accept':
        if (participant.status !== 'invited') {
          return cors({
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              message: 'Invitation already processed',
            }),
          });
        }

        await client.query(
          `UPDATE battle_participants
           SET status = 'accepted', accepted_at = NOW()
           WHERE id = $1`,
          [participant.id]
        );

        // Notify host
        await client.query(
          `INSERT INTO notifications (
            user_id, type, title, message, data, from_user_id
          ) VALUES ($1, 'battle_accepted', 'Battle Accepted',
            'Your opponent accepted the battle invitation!', $2, $3)`,
          [
            battle.host_id,
            JSON.stringify({ battleId: battle.id }),
            userId,
          ]
        );

        response.message = 'Invitation accepted';
        break;

      case 'decline':
        if (participant.status !== 'invited') {
          return cors({
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              message: 'Invitation already processed',
            }),
          });
        }

        await client.query(
          `UPDATE battle_participants
           SET status = 'declined', declined_at = NOW()
           WHERE id = $1`,
          [participant.id]
        );

        // Notify host
        await client.query(
          `INSERT INTO notifications (
            user_id, type, title, message, data, from_user_id
          ) VALUES ($1, 'battle_declined', 'Battle Declined',
            'Your opponent declined the battle invitation', $2, $3)`,
          [
            battle.host_id,
            JSON.stringify({ battleId: battle.id }),
            userId,
          ]
        );

        response.message = 'Invitation declined';
        break;

      case 'start':
        if (participant.status !== 'accepted' && participant.status !== 'joined') {
          return cors({
            statusCode: 400,
            body: JSON.stringify({
              success: false,
              message: 'You must accept the invitation first',
            }),
          });
        }

        // Generate cryptographically random UID for Agora
        const agoraUid = require('crypto').randomInt(1, 2147483647);

        // Generate Agora token
        const expirationTimeInSeconds = 3600 * 2; // 2 hours
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

        agoraToken = RtcTokenBuilder.buildTokenWithUid(
          AGORA_APP_ID,
          AGORA_APP_CERTIFICATE,
          battle.agora_channel_name,
          agoraUid,
          RtcRole.PUBLISHER,
          privilegeExpiredTs
        );

        // Update participant
        await client.query(
          `UPDATE battle_participants
           SET status = 'joined', agora_uid = $1, is_streaming = TRUE
           WHERE id = $2`,
          [agoraUid, participant.id]
        );

        // If host starts, update battle status to live
        if (battle.host_id === userId && battle.status !== 'live') {
          await client.query(
            `UPDATE live_battles
             SET status = 'live', started_at = NOW()
             WHERE id = $1`,
            [battleId]
          );
        }

        response = {
          success: true,
          message: 'Joined battle',
          agora: {
            appId: AGORA_APP_ID,
            channelName: battle.agora_channel_name,
            token: agoraToken,
            uid: agoraUid,
          },
          position: participant.position,
        };
        break;

      case 'leave':
        await client.query(
          `UPDATE battle_participants
           SET status = 'left', is_streaming = FALSE
           WHERE id = $1`,
          [participant.id]
        );

        // Check if all participants left
        const remainingResult = await client.query(
          `SELECT COUNT(*) as count FROM battle_participants
           WHERE battle_id = $1 AND status = 'joined' AND is_streaming = TRUE`,
          [battleId]
        );

        if (parseInt(remainingResult.rows[0].count) === 0) {
          // End battle if no one is streaming
          await client.query(
            `UPDATE live_battles
             SET status = 'ended', ended_at = NOW()
             WHERE id = $1`,
            [battleId]
          );
        }

        response.message = 'Left battle';
        break;
    }

    await client.query('COMMIT');

    return cors({
      statusCode: 200,
      body: JSON.stringify(response),
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Join battle error:', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'Failed to process action',
      }),
    });
  } finally {
    client.release();
  }
};
