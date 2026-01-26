/**
 * WebSocket Default Handler
 * Handles unknown routes/actions
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Default handler received:', JSON.stringify(event.body));

  return {
    statusCode: 400,
    body: JSON.stringify({
      message: 'Unknown action. Supported actions: sendMessage',
    }),
  };
}
