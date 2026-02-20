/**
 * Tests for disputes/accept-resolution Lambda handler
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/rate-limit', () => ({ requireRateLimit: jest.fn().mockResolvedValue(null) }));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' })),
}));
jest.mock('../../utils/auth', () => ({ getUserFromEvent: jest.fn() }));

import { handler } from '../../disputes/accept-resolution';
import { getUserFromEvent } from '../../utils/auth';
import { requireRateLimit } from '../../utils/rate-limit';

const VALID_DISPUTE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'POST',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { id: VALID_DISPUTE_ID },
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? 'cognito-sub-123' } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('disputes/accept-resolution handler', () => {
  let mockDb: { query: jest.Mock; connect: jest.Mock };
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn().mockResolvedValue(mockClient),
    };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
    (getUserFromEvent as jest.Mock).mockResolvedValue({ id: TEST_USER_ID });
    (requireRateLimit as jest.Mock).mockResolvedValue(null);
  });

  it('should return 204 for OPTIONS', async () => {
    const result = await handler(makeEvent({ httpMethod: 'OPTIONS' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(204);
  });

  it('should return 405 for GET', async () => {
    const result = await handler(makeEvent({ httpMethod: 'GET' }), {} as never, {} as never);
    expect(result!.statusCode).toBe(405);
  });

  it('should return 400 when dispute ID is missing or invalid', async () => {
    const result = await handler(makeEvent({ pathParameters: { id: 'bad' } }), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
  });

  it('should return 401 when no auth', async () => {
    (getUserFromEvent as jest.Mock).mockResolvedValueOnce(null);
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(401);
  });

  it('should return 404 when dispute not found', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [] }); // dispute not found
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(404);
  });

  it('should return 403 when user is not complainant', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{
      id: VALID_DISPUTE_ID,
      status: 'resolved',
      resolution: 'full_refund',
      complainant_id: 'different-user-id',
      respondent_id: 'resp-id',
      dispute_number: 'D-001',
    }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(403);
  });

  it('should return 400 when dispute is not in resolved status', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{
      id: VALID_DISPUTE_ID,
      status: 'open',
      resolution: null,
      complainant_id: TEST_USER_ID,
      respondent_id: 'resp-id',
      dispute_number: 'D-001',
    }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('must be resolved');
  });

  it('should return 400 when dispute is already closed', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{
      id: VALID_DISPUTE_ID,
      status: 'closed',
      resolution: 'full_refund',
      complainant_id: TEST_USER_ID,
      respondent_id: 'resp-id',
      dispute_number: 'D-001',
    }] });
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(400);
    expect(JSON.parse(result!.body).message).toContain('already closed');
  });

  it('should return 200 and close the dispute on success', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [{
        id: VALID_DISPUTE_ID,
        status: 'resolved',
        resolution: 'full_refund',
        complainant_id: TEST_USER_ID,
        respondent_id: 'resp-id',
        dispute_number: 'D-001',
      }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE status
      .mockResolvedValueOnce({ rows: [] }) // INSERT timeline
      .mockResolvedValueOnce({ rows: [] }) // INSERT notification
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(200);
    expect(JSON.parse(result!.body).success).toBe(true);
  });

  it('should return 500 and ROLLBACK on error', async () => {
    mockClient.query.mockRejectedValueOnce(new Error('DB error'));
    const result = await handler(makeEvent(), {} as never, {} as never);
    expect(result!.statusCode).toBe(500);
    expect(mockClient.release).toHaveBeenCalled();
  });
});
