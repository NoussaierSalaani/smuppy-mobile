/**
 * Pack Management Handler
 * POST /packs - Create a new pack (creator only)
 * PUT /packs/{id} - Update a pack
 * DELETE /packs/{id} - Delete a pack
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { getPool, corsHeaders, SqlParam } from '../../shared/db';

interface CreatePackBody {
  name: string;
  description?: string;
  sessionsIncluded: number;
  sessionDuration: number;
  validityDays: number;
  price: number;
  savingsPercent?: number;
}

interface UpdatePackBody extends Partial<CreatePackBody> {
  isActive?: boolean;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const userId = event.requestContext.authorizer?.claims?.sub;
  if (!userId) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Unauthorized' }),
    };
  }

  const pool = await getPool();
  const packId = event.pathParameters?.id;

  try {
    // Verify user is a pro_creator
    const userResult = await pool.query(
      `SELECT account_type FROM profiles WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].account_type !== 'pro_creator') {
      return {
        statusCode: 403,
        headers: corsHeaders,
        body: JSON.stringify({ success: false, message: 'Only pro creators can manage packs' }),
      };
    }

    // CREATE
    if (event.httpMethod === 'POST' && !packId) {
      const body: CreatePackBody = JSON.parse(event.body || '{}');
      const { name, description, sessionsIncluded, sessionDuration, validityDays, price, savingsPercent } = body;

      if (!name || !sessionsIncluded || !sessionDuration || !validityDays || !price) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'Missing required fields' }),
        };
      }

      // Input validation bounds
      if (name.length > 100) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Name too long (max 100)' }) };
      }
      if (sessionsIncluded < 1 || sessionsIncluded > 100) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Sessions must be between 1 and 100' }) };
      }
      if (sessionDuration < 15 || sessionDuration > 480) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Duration must be between 15 and 480 minutes' }) };
      }
      if (validityDays < 1 || validityDays > 365) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Validity must be between 1 and 365 days' }) };
      }
      if (price <= 0 || price > 50000) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ success: false, message: 'Price must be between 0 and 50000' }) };
      }

      const result = await pool.query(
        `INSERT INTO session_packs (
          creator_id, name, description, sessions_included, session_duration,
          validity_days, price, savings_percent, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
        RETURNING *`,
        [userId, name, description || null, sessionsIncluded, sessionDuration, validityDays, price, savingsPercent || 0]
      );

      const pack = result.rows[0];

      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          pack: {
            id: pack.id,
            name: pack.name,
            description: pack.description,
            sessionsIncluded: pack.sessions_included,
            sessionDuration: pack.session_duration,
            validityDays: pack.validity_days,
            price: parseFloat(pack.price),
            savings: pack.savings_percent,
            isActive: pack.is_active,
          },
        }),
      };
    }

    // UPDATE
    if (event.httpMethod === 'PUT' && packId) {
      // Verify ownership
      const ownerCheck = await pool.query(
        `SELECT id FROM session_packs WHERE id = $1 AND creator_id = $2`,
        [packId, userId]
      );

      if (ownerCheck.rows.length === 0) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'Pack not found' }),
        };
      }

      const body: UpdatePackBody = JSON.parse(event.body || '{}');
      const updates: string[] = [];
      const values: SqlParam[] = [];
      let paramIndex = 1;

      if (body.name !== undefined) {
        updates.push(`name = $${paramIndex++}`);
        values.push(body.name);
      }
      if (body.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(body.description);
      }
      if (body.sessionsIncluded !== undefined) {
        updates.push(`sessions_included = $${paramIndex++}`);
        values.push(body.sessionsIncluded);
      }
      if (body.sessionDuration !== undefined) {
        updates.push(`session_duration = $${paramIndex++}`);
        values.push(body.sessionDuration);
      }
      if (body.validityDays !== undefined) {
        updates.push(`validity_days = $${paramIndex++}`);
        values.push(body.validityDays);
      }
      if (body.price !== undefined) {
        updates.push(`price = $${paramIndex++}`);
        values.push(body.price);
      }
      if (body.savingsPercent !== undefined) {
        updates.push(`savings_percent = $${paramIndex++}`);
        values.push(body.savingsPercent);
      }
      if (body.isActive !== undefined) {
        updates.push(`is_active = $${paramIndex++}`);
        values.push(body.isActive);
      }

      if (updates.length === 0) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'No updates provided' }),
        };
      }

      values.push(packId);
      const result = await pool.query(
        `UPDATE session_packs SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${paramIndex} RETURNING *`,
        values
      );

      const pack = result.rows[0];

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          success: true,
          pack: {
            id: pack.id,
            name: pack.name,
            description: pack.description,
            sessionsIncluded: pack.sessions_included,
            sessionDuration: pack.session_duration,
            validityDays: pack.validity_days,
            price: parseFloat(pack.price),
            savings: pack.savings_percent,
            isActive: pack.is_active,
          },
        }),
      };
    }

    // DELETE
    if (event.httpMethod === 'DELETE' && packId) {
      // Verify ownership
      const ownerCheck = await pool.query(
        `SELECT id FROM session_packs WHERE id = $1 AND creator_id = $2`,
        [packId, userId]
      );

      if (ownerCheck.rows.length === 0) {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, message: 'Pack not found' }),
        };
      }

      // Soft delete by setting inactive, or hard delete if no purchases
      const purchaseCheck = await pool.query(
        `SELECT id FROM user_session_packs WHERE pack_id = $1 LIMIT 1`,
        [packId]
      );

      if (purchaseCheck.rows.length > 0) {
        // Has purchases - soft delete
        await pool.query(
          `UPDATE session_packs SET is_active = false WHERE id = $1`,
          [packId]
        );
      } else {
        // No purchases - hard delete
        await pool.query(`DELETE FROM session_packs WHERE id = $1`, [packId]);
      }

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, message: 'Pack deleted' }),
      };
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  } catch (error) {
    console.error('Pack management error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Failed to manage pack' }),
    };
  }
};
