/**
 * Health Check Endpoint
 *
 * Simple public endpoint returning service status.
 * No VPC, no DB, no auth — lightweight canary for monitoring.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const origin = event.headers?.origin || event.headers?.Origin || '*';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Request-Id',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Cache-Control': 'no-store',
  };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: process.env.ENVIRONMENT || 'unknown',
    }),
  };
};
