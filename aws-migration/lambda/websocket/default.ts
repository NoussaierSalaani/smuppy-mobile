/**
 * WebSocket Default Handler
 * Handles unknown routes/actions and ping keep-alive
 *
 * Supported actions:
 * - ping: Keep-alive response (returns pong)
 * - unknown: Returns 400 with supported actions
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../shared/db';
import { createLogger } from '../api/utils/logger';

const log = createLogger('websocket-default');

// Stale connection threshold: 2 hours
const STALE_CONNECTION_THRESHOLD_MS = 2 * 60 * 60 * 1000;

// Cleanup runs at most once per 10 minutes per Lambda instance
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  let action: string | undefined;
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    action = body.action;
  } catch {
    action = undefined;
  }

  // Handle ping keep-alive
  if (action === 'ping') {
    // Opportunistically clean up stale connections
    const now = Date.now();
    if (now - lastCleanupAt > CLEANUP_INTERVAL_MS) {
      lastCleanupAt = now;
      cleanupStaleConnections().catch(err =>
        log.error('Stale connection cleanup failed', err)
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ action: 'pong', timestamp: now }),
    };
  }

  log.info('Unknown WebSocket action', { action, body: event.body?.substring(0, 200) });

  return {
    statusCode: 400,
    body: JSON.stringify({
      message: 'Unknown action. Supported actions: sendMessage, ping',
    }),
  };
}

/**
 * Remove WebSocket connections older than the stale threshold.
 * Runs opportunistically during ping handling to avoid needing a separate scheduled Lambda.
 */
async function cleanupStaleConnections(): Promise<void> {
  const db = await getPool();
  const threshold = new Date(Date.now() - STALE_CONNECTION_THRESHOLD_MS).toISOString();

  const result = await db.query(
    'DELETE FROM websocket_connections WHERE connected_at < $1',
    [threshold]
  );

  const deletedCount = result.rowCount ?? 0;
  if (deletedCount > 0) {
    log.info('Cleaned up stale WebSocket connections', { deletedCount });
  }
}
