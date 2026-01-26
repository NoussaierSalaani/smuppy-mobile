/**
 * WebSocket Default Handler
 * Handles unknown routes/actions
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createLogger } from '../api/utils/logger';

const log = createLogger('websocket-default');

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  log.info('Default handler received', { body: event.body });

  return {
    statusCode: 400,
    body: JSON.stringify({
      message: 'Unknown action. Supported actions: sendMessage',
    }),
  };
}
