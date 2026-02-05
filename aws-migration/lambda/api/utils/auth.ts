/**
 * Authentication utilities for Lambda handlers
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { headers as corsHeaders } from './cors';

export { corsHeaders };

interface AuthUser {
  id: string;
  sub: string;
  email?: string;
  username?: string;
}

/**
 * Extract authenticated user from API Gateway event
 * Works with Cognito authorizer
 */
export function getUserFromEvent(event: APIGatewayProxyEvent): AuthUser | null {
  const claims = event.requestContext.authorizer?.claims;

  if (!claims?.sub) {
    return null;
  }

  return {
    id: claims.sub,
    sub: claims.sub,
    email: claims.email,
    username: claims['cognito:username'] || claims.username,
  };
}

/**
 * Require authenticated user, throw error if not authenticated
 */
export function requireUser(event: APIGatewayProxyEvent): AuthUser {
  const user = getUserFromEvent(event);

  if (!user) {
    throw new Error('Unauthorized');
  }

  return user;
}
