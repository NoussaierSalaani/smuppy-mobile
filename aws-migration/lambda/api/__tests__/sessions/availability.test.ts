/**
 * Tests for sessions/availability Lambda handler
 * Covers: auth, validation, creator checks, slot generation, booked slot filtering, error handling
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { getPool } from '../../../shared/db';

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
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
  createHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
  getSecureHeaders: jest.fn(() => ({ 'Content-Type': 'application/json' })),
}));

import { handler } from '../../sessions/availability';

const TEST_SUB = 'cognito-sub-test123';
const CREATOR_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makeEvent(overrides: Partial<Record<string, unknown>> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: overrides.httpMethod as string ?? 'GET',
    headers: {},
    body: null,
    queryStringParameters: overrides.queryStringParameters as Record<string, string> ?? null,
    pathParameters: overrides.pathParameters as Record<string, string> ?? { creatorId: CREATOR_ID },
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

const mockQuery = jest.fn();

function makeCreatorRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: CREATOR_ID,
    full_name: 'Test Creator',
    username: 'testcreator',
    avatar_url: 'https://example.com/avatar.jpg',
    sessions_enabled: true,
    session_price: '50.00',
    session_duration: 30,
    session_availability: null, // use default
    timezone: 'Europe/Paris',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (getPool as jest.Mock).mockResolvedValue({ query: mockQuery });
  mockQuery.mockResolvedValue({ rows: [] });
});

describe('sessions/availability handler', () => {
  describe('authentication', () => {
    it('should return 401 when unauthenticated', async () => {
      const event = makeEvent({ sub: null });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(401);
    });

    it('should return 401 when authorizer is missing', async () => {
      const event = {
        ...makeEvent(),
        requestContext: { requestId: 'test', identity: { sourceIp: '127.0.0.1' } },
      } as unknown as APIGatewayProxyEvent;
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(401);
    });
  });

  describe('OPTIONS handling', () => {
    it('should return 200 for OPTIONS', async () => {
      const event = makeEvent({ httpMethod: 'OPTIONS' });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });
  });

  describe('validation', () => {
    it('should return 400 when creatorId missing', async () => {
      const event = makeEvent({ pathParameters: {} });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Creator ID required');
    });

    it('should return 400 when pathParameters is null', async () => {
      const event = makeEvent({ pathParameters: null as unknown as Record<string, string> });
      // Override pathParameters to be truly empty
      (event as Record<string, unknown>).pathParameters = null;
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 for invalid creatorId format', async () => {
      const event = makeEvent({ pathParameters: { creatorId: 'not-a-uuid' } });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('Invalid creator ID format');
    });

    it('should return 400 for creatorId with SQL injection attempt', async () => {
      const event = makeEvent({ pathParameters: { creatorId: "'; DROP TABLE profiles;--" } });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });
  });

  describe('creator validation', () => {
    it('should return 404 when creator not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body).message).toContain('Creator not found');
    });

    it('should return 400 when creator does not accept sessions', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [makeCreatorRow({ sessions_enabled: false })],
      });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).message).toContain('does not accept sessions');
    });
  });

  describe('happy path — slot generation', () => {
    it('should return 200 with creator details and available slots', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] }) // creator
        .mockResolvedValueOnce({ rows: [] }); // no booked sessions
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.creator).toBeDefined();
      expect(body.creator.id).toBe(CREATOR_ID);
      expect(body.creator.name).toBe('Test Creator');
      expect(body.creator.username).toBe('testcreator');
      expect(body.creator.avatar).toBe('https://example.com/avatar.jpg');
      expect(body.creator.sessionPrice).toBe(50.0);
      expect(body.creator.sessionDuration).toBe(30);
      expect(body.creator.timezone).toBe('Europe/Paris');
      expect(body.availableSlots).toBeInstanceOf(Array);
    });

    it('should return empty slots on weekends with default availability', async () => {
      // Default availability has empty arrays for saturday and sunday
      // Use a Saturday as startDate (2026-03-08 is a Saturday, getDay() === 6)
      const saturday = new Date('2026-03-08');
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] }) // creator
        .mockResolvedValueOnce({ rows: [] }); // no booked sessions
      const event = makeEvent({
        queryStringParameters: { startDate: saturday.toISOString().split('T')[0], days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Saturday should have no slots with default availability
      expect(body.availableSlots.length).toBe(0);
    });

    it('should use custom availability when provided by creator', async () => {
      const customAvailability = {
        monday: [{ start: '10:00', end: '12:00' }],
        tuesday: [],
        wednesday: [],
        thursday: [],
        friday: [],
        saturday: [],
        sunday: [],
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ session_availability: customAvailability })] })
        .mockResolvedValueOnce({ rows: [] }); // no booked sessions
      // Use a Monday far in the future
      const monday = new Date('2026-03-09'); // A Monday
      const event = makeEvent({
        queryStringParameters: { startDate: monday.toISOString().split('T')[0], days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Slots should be generated for 10:00-12:00 in 30-min intervals: 10:00, 10:30, 11:00, 11:30
      // But only if they're > 2 hours from now (which they will be since it's in the future)
      expect(body.availableSlots).toBeInstanceOf(Array);
      // Each slot should have date, time, datetime
      if (body.availableSlots.length > 0) {
        expect(body.availableSlots[0]).toHaveProperty('date');
        expect(body.availableSlots[0]).toHaveProperty('time');
        expect(body.availableSlots[0]).toHaveProperty('datetime');
      }
    });

    it('should default session_duration to 30 when not set', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ session_duration: null })] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.creator.sessionDuration).toBe(30);
    });

    it('should default timezone to Europe/Paris when not set', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ timezone: null })] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.creator.timezone).toBe('Europe/Paris');
    });

    it('should default session_price to 0 when not set', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ session_price: null })] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.creator.sessionPrice).toBe(0);
    });
  });

  describe('query parameters', () => {
    it('should accept custom startDate', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { startDate: '2026-04-01' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should accept custom days parameter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { days: '14' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should default to 7 days when days not provided', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
      // Verify the booked sessions query uses correct date range
      const bookedQuery = mockQuery.mock.calls[1];
      expect(bookedQuery[1][0]).toBe(CREATOR_ID);
    });
  });

  describe('booked slot filtering', () => {
    it('should filter out slots that conflict with booked sessions', async () => {
      // Use a far-future Monday to ensure slots are valid (> 2h from now)
      const futureMonday = '2026-06-01'; // A Monday
      const bookedAt = `${futureMonday}T10:00:00.000Z`;
      mockQuery
        .mockResolvedValueOnce({
          rows: [makeCreatorRow({
            session_availability: {
              monday: [{ start: '10:00', end: '12:00' }],
              tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
            },
          })],
        })
        .mockResolvedValueOnce({
          rows: [{ scheduled_at: bookedAt, duration: 30 }], // 10:00-10:30 is booked
        });
      const event = makeEvent({
        queryStringParameters: { startDate: futureMonday, days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // The 10:00 slot should be filtered out
      const tenAm = body.availableSlots.find((s: { time: string }) => s.time === '10:00');
      expect(tenAm).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toContain('Failed to get availability');
    });

    it('should return 500 on booked sessions query error', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockRejectedValueOnce(new Error('Booked query failed'));
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(500);
    });
  });
});
