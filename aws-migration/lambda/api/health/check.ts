/**
 * Health Check Endpoint
 *
 * Simple public endpoint returning service status.
 * No VPC, no DB, no auth — lightweight canary for monitoring.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getSecureHeaders } from '../utils/cors';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin || '';
  const headers = getSecureHeaders(requestOrigin);

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
