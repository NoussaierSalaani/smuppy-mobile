/**
 * WebSocket Disconnect Handler
 * Handles WebSocket disconnections and cleans up connection info
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../shared/db';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const connectionId = event.requestContext.connectionId;

  try {
    const db = await getPool();

    // Remove connection from database
    await db.query(
      'DELETE FROM websocket_connections WHERE connection_id = $1',
      [connectionId]
    );

    console.log(`WebSocket disconnected: ${connectionId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected' }),
    };
  } catch (error: any) {
    console.error('Error in WebSocket disconnect:', error);
    // Still return success - connection is gone anyway
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Disconnected' }),
    };
  }
}
