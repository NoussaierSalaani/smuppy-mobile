import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHeaders } from '../utils/cors';
import { checkRateLimit } from '../utils/rate-limit';
import { getPool } from '../../shared/db';
import { createLogger } from '../utils/logger';
import { randomBytes } from 'crypto';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const log = createLogger('auth/ws-token');
const dynamoClient = new DynamoDBClient({});
const WS_TOKENS_TABLE = process.env.WS_TOKENS_TABLE || 'smuppy-ws-tokens';

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);

  try {
    const cognitoSub = event.requestContext.authorizer?.claims?.sub;
    if (!cognitoSub) {
      return { statusCode: 401, headers, body: JSON.stringify({ success: false, message: 'Unauthorized' }) };
    }

    // Rate limit: 10 token requests per minute
    const rateLimitResult = await checkRateLimit({
      prefix: 'ws-token',
      identifier: cognitoSub,
      windowSeconds: 60,
      maxRequests: 10,
    });
    if (!rateLimitResult.allowed) {
      return { statusCode: 429, headers, body: JSON.stringify({ success: false, message: 'Too many requests' }) };
    }

    // Verify user exists
    const db = getPool();
    const userResult = await db.query(
      'SELECT id FROM profiles WHERE cognito_sub = $1',
      [cognitoSub]
    );
    if (userResult.rows.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ success: false, message: 'Profile not found' }) };
    }

    const userId = userResult.rows[0].id;
    const token = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes

    // Store token in DynamoDB with TTL
    await dynamoClient.send(new PutItemCommand({
      TableName: WS_TOKENS_TABLE,
      Item: {
        token: { S: token },
        userId: { S: userId },
        cognitoSub: { S: cognitoSub },
        ttl: { N: String(expiresAt) },
      },
    }));

    log.info('WebSocket token created', { userId: userId.substring(0, 8) + '***' });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        token,
        expiresIn: 300,
      }),
    };
  } catch (error) {
    log.error('Failed to create WebSocket token', error);
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, message: 'An unexpected error occurred' }) };
  }
};
