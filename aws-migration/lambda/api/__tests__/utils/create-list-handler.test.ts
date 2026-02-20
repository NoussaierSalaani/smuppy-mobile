/**
 * Unit Tests: createListHandler
 *
 * Tests the factory that creates list handlers for static reference data
 * (e.g. moods, activities). The handler queries a table for id, name, icon,
 * category and returns { success: true, data }.
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

import { APIGatewayProxyEvent } from 'aws-lambda';
import { createListHandler } from '../../utils/create-list-handler';
import { getPool } from '../../../shared/db';
import { createCacheableHeaders } from '../../utils/cors';

const mockedGetPool = getPool as jest.MockedFunction<typeof getPool>;

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    body: null,
    queryStringParameters: null,
    pathParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '/',
    resource: '/',
    stageVariables: null,
    requestContext: {
      requestId: 'test-request-id',
      authorizer: undefined,
      identity: { sourceIp: '127.0.0.1' },
    },
  } as unknown as APIGatewayProxyEvent;
}

describe('createListHandler', () => {
  const config = {
    tableName: 'moods',
    loggerName: 'moods-list',
    description: 'moods',
  };

  let handler: ReturnType<typeof createListHandler>;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = jest.fn();
    mockedGetPool.mockResolvedValue({ query: mockQuery } as never);
    handler = createListHandler(config);
  });

  it('should return list of items with cacheable headers', async () => {
    const rows = [
      { id: '1', name: 'Happy', icon: '😊', category: 'positive' },
      { id: '2', name: 'Sad', icon: '😢', category: 'negative' },
    ];
    mockQuery.mockResolvedValue({ rows });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(rows);
    expect(body.data).toHaveLength(2);
    expect(createCacheableHeaders).toHaveBeenCalled();
  });

  it('should return empty array when no items in table', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('should return 500 when database query fails', async () => {
    mockQuery.mockRejectedValue(new Error('Connection refused'));

    const result = await handler(makeEvent());

    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('Internal server error');
  });

  it('should query the configured table name', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await handler(makeEvent());

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM moods')
    );
  });

  it('should map only id, name, icon, category fields from rows', async () => {
    const rows = [
      { id: '1', name: 'Happy', icon: '😊', category: 'positive', extra_field: 'should not appear' },
    ];
    mockQuery.mockResolvedValue({ rows });

    const result = await handler(makeEvent());

    const body = JSON.parse(result.body);
    expect(body.data[0]).toEqual({
      id: '1',
      name: 'Happy',
      icon: '😊',
      category: 'positive',
    });
    expect(body.data[0].extra_field).toBeUndefined();
  });
});
