/**
 * Unit Tests: createReportHandler
 *
 * Tests the factory for report handlers (comment, post, user, message, peak, livestream).
 * All share: auth, rate limiting, reason validation, sanitization, transaction pattern, escalation.
 */

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));
jest.mock('../../utils/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  requireRateLimit: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('../../utils/cors', () => ({
  createHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
  })),
  createCacheableHeaders: jest.fn(() => ({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));
jest.mock('../../utils/auth', () => ({
  resolveProfileId: jest.fn(),
  checkPrivacyAccess: jest.fn(),
}));
jest.mock('../../utils/security', () => ({
  isValidUUID: jest.fn(),
}));
jest.mock('../../utils/constants', () => ({
  RATE_WINDOW_1_MIN: 60,
  RATE_WINDOW_5_MIN: 300,
  MAX_REPORT_REASON_LENGTH: 100,
  MAX_REPORT_DETAILS_LENGTH: 1000,
}));

import { APIGatewayProxyEvent } from 'aws-lambda';
import { createReportHandler } from '../../utils/create-report-handler';
import { getPool } from '../../../shared/db';
import { requireRateLimit } from '../../utils/rate-limit';
import { resolveProfileId } from '../../utils/auth';
import { isValidUUID } from '../../utils/security';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;
const mockedRequireRateLimit = requireRateLimit as jest.MockedFunction<typeof requireRateLimit>;
const mockedResolveProfileId = resolveProfileId as jest.MockedFunction<typeof resolveProfileId>;
const mockedIsValidUUID = isValidUUID as jest.MockedFunction<typeof isValidUUID>;

const TEST_SUB = 'cognito-sub-test123';
const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_POST_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_REPORT_ID = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const TEST_CONVERSATION_ID = 'd3e4f5a6-b7c8-9012-dcba-0987654321ff';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: {},
    body: overrides.body as string ?? null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: overrides.sub !== null
        ? { claims: { sub: overrides.sub ?? TEST_SUB } }
        : undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('createReportHandler', () => {
  let mockQuery: jest.Mock;
  let mockClient: { query: jest.Mock; release: jest.Mock };
  let mockConnect: jest.Mock;
  let mockRunEscalation: jest.Mock;

const baseConfig = {
  loggerName: 'report-post',
  resourceType: 'post',
  idField: 'postId',
  entityTable: 'posts',
  reportTable: 'post_reports',
  resourceIdColumn: 'post_id',
  runEscalation: jest.fn(),
} as const;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQuery = jest.fn();
    mockClient = { query: jest.fn(), release: jest.fn() };
    mockConnect = jest.fn().mockResolvedValue(mockClient);
    mockedGetPool.mockResolvedValue({
      query: mockQuery,
      connect: mockConnect,
    } as never);

    mockedIsValidUUID.mockReturnValue(true);
    mockedRequireRateLimit.mockResolvedValue(null);
    mockedResolveProfileId.mockResolvedValue(TEST_PROFILE_ID);
    mockRunEscalation = jest.fn().mockResolvedValue(undefined);
  });

  it('should return 401 when no auth', async () => {
    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({ sub: null });

    const result = await handler(event);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).message).toBe('Unauthorized');
  });

  it('should return 429 when rate limited', async () => {
    const rateLimitResponse = {
      statusCode: 429,
      headers: {},
      body: JSON.stringify({ message: 'Too many requests' }),
    };
    mockedRequireRateLimit.mockResolvedValue(rateLimitResponse);

    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(429);
  });

  it('should return 400 for invalid resource ID', async () => {
    mockedIsValidUUID.mockReturnValue(false);
    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: 'bad-uuid', reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid post ID format');
  });

  it('should return 400 when reason is missing', async () => {
    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Reason is required');
  });

  it('should return 400 when reason is empty string', async () => {
    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: '   ' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Reason is required');
  });

  it('should return 400 for invalid reason when validReasons configured', async () => {
    const handler = createReportHandler({
      ...baseConfig,
      validReasons: ['spam', 'harassment', 'hate'],
      runEscalation: mockRunEscalation,
    });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'something-else' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Invalid report reason');
  });

  it('should return 404 when profile not found', async () => {
    mockedResolveProfileId.mockResolvedValue(null);
    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Profile not found');
  });

  it('should return 400 when self-report is prevented', async () => {
    mockedResolveProfileId.mockResolvedValue(TEST_POST_ID); // same as resource
    const handler = createReportHandler({
      ...baseConfig,
      preventSelfReport: true,
      runEscalation: mockRunEscalation,
    });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe('Cannot report yourself');
  });

  it('should return 404 when entity not found', async () => {
    mockQuery.mockResolvedValue({ rows: [] }); // entity check
    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).message).toBe('Post not found');
    expect(mockQuery).toHaveBeenCalledWith('SELECT id FROM posts WHERE id = $1', [TEST_POST_ID]);
  });

  it('should return 409 on duplicate report', async () => {
    // Entity exists
    mockQuery.mockResolvedValue({ rows: [{ id: TEST_POST_ID }] });
    // Duplicate check in transaction returns existing report
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: TEST_REPORT_ID }] }) // existing report
      .mockResolvedValueOnce(undefined); // ROLLBACK

    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(409);
    expect(JSON.parse(result.body).message).toBe('You have already reported this post');
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id FROM post_reports WHERE reporter_id = $1 AND post_id = $2 FOR UPDATE',
      [TEST_PROFILE_ID, TEST_POST_ID],
    );
  });

  it('should return 201 on successful report', async () => {
    // Entity exists
    mockQuery.mockResolvedValue({ rows: [{ id: TEST_POST_ID }] });
    // Transaction: no duplicate, then INSERT
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // no existing report
      .mockResolvedValueOnce({ rows: [{ id: TEST_REPORT_ID }] }) // INSERT RETURNING id
      .mockResolvedValueOnce(undefined); // COMMIT

    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.id).toBe(TEST_REPORT_ID);
    expect(mockRunEscalation).toHaveBeenCalled();
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id FROM post_reports WHERE reporter_id = $1 AND post_id = $2 FOR UPDATE',
      [TEST_PROFILE_ID, TEST_POST_ID],
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      3,
      'INSERT INTO post_reports (reporter_id, post_id, reason, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [TEST_PROFILE_ID, TEST_POST_ID, 'spam', null],
    );
  });

  it('should return 500 on database error', async () => {
    mockQuery.mockRejectedValue(new Error('Connection refused'));
    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('should use customEntityCheck when provided', async () => {
    const customCheck = jest.fn().mockResolvedValue(false);
    const handler = createReportHandler({
      ...baseConfig,
      entityTable: undefined,
      customEntityCheck: customCheck,
      runEscalation: mockRunEscalation,
    });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(customCheck).toHaveBeenCalled();
  });

  it('should still succeed when escalation throws (non-blocking)', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: TEST_POST_ID }] });
    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // no existing report
      .mockResolvedValueOnce({ rows: [{ id: TEST_REPORT_ID }] }) // INSERT
      .mockResolvedValueOnce(undefined); // COMMIT
    mockRunEscalation.mockRejectedValue(new Error('Escalation service down'));

    const handler = createReportHandler({ ...baseConfig, runEscalation: mockRunEscalation });
    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(201);
  });

  it('should reject unsupported report type before querying', async () => {
    const handler = createReportHandler({
      ...baseConfig,
      resourceType: 'unsupported' as unknown as typeof baseConfig.resourceType,
      runEscalation: mockRunEscalation,
    });

    const event = makeEvent({
      body: JSON.stringify({ postId: TEST_POST_ID, reason: 'spam' }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('should use whitelisted insert params for message reports', async () => {
    const messageConfig = {
      loggerName: 'reports-message',
      resourceType: 'message',
      idField: 'messageId',
      extraIdFields: ['conversationId'],
      reportTable: 'message_reports',
      resourceIdColumn: 'message_id',
      runEscalation: mockRunEscalation,
      customEntityCheck: jest.fn().mockResolvedValue(true),
    } as const;

    mockClient.query
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // no existing report
      .mockResolvedValueOnce({ rows: [{ id: TEST_REPORT_ID }] }) // INSERT
      .mockResolvedValueOnce(undefined); // COMMIT

    const handler = createReportHandler(messageConfig);
    const event = makeEvent({
      body: JSON.stringify({
        messageId: TEST_POST_ID,
        conversationId: TEST_CONVERSATION_ID,
        reason: 'spam',
        details: 'details',
      }),
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(201);
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id FROM message_reports WHERE reporter_id = $1 AND message_id = $2 FOR UPDATE',
      [TEST_PROFILE_ID, TEST_POST_ID],
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      3,
      'INSERT INTO message_reports (reporter_id, message_id, reason, description, conversation_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [TEST_PROFILE_ID, TEST_POST_ID, 'spam', 'details', TEST_CONVERSATION_ID],
    );
  });
});
