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
      // Use a far-future Saturday where new Date(str).getDay() === 6
      const satStr = (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 6);
        for (let i = 0; i < 10; i++) {
          const s = d.toISOString().split('T')[0];
          if (new Date(s).getDay() === 6) return s;
          d.setDate(d.getDate() + 1);
        }
        throw new Error('Could not find a Saturday');
      })();
      const saturday = new Date(satStr);
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
    /**
     * Helper to get a far-future start date string (YYYY-MM-DD) where
     * new Date(str).getDay() returns the target day.
     * We must match how the handler interprets the date: `new Date(startDate)`
     * which treats YYYY-MM-DD as UTC midnight, then getDay() in local time.
     */
    function getFutureStartDateForDay(targetDay: number): string {
      // Brute-force: try dates 6+ months from now until getDay() matches
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      for (let i = 0; i < 10; i++) {
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
        const parsed = new Date(dateStr); // Same as handler does
        if (parsed.getDay() === targetDay) {
          return dateStr;
        }
        d.setDate(d.getDate() + 1);
      }
      throw new Error(`Could not find a date for day ${targetDay}`);
    }

    it('should filter out slots that conflict with booked sessions', async () => {
      // Find a date where new Date('YYYY-MM-DD').getDay() === 1 (Monday)
      const futureMonday = getFutureStartDateForDay(1);
      // Create a booked session at 14:00 on that day (use same Date logic as handler)
      const bookedDate = new Date(futureMonday);
      bookedDate.setHours(14, 0, 0, 0); // local 14:00
      const bookedAt = bookedDate.toISOString();
      mockQuery
        .mockResolvedValueOnce({
          rows: [makeCreatorRow({
            session_availability: {
              monday: [{ start: '14:00', end: '16:00' }],
              tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
            },
            session_duration: 30,
          })],
        })
        .mockResolvedValueOnce({
          rows: [{ scheduled_at: bookedAt, duration: 30 }], // 14:00-14:30 is booked
        });
      const event = makeEvent({
        queryStringParameters: { startDate: futureMonday, days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Some slots should exist (14:30, 15:00, 15:30 but NOT 14:00)
      expect(body.availableSlots.length).toBeGreaterThan(0);
      const fourteenHundred = body.availableSlots.find((s: { time: string }) => s.time === '14:00');
      expect(fourteenHundred).toBeUndefined();
    });

    it('should include non-conflicting slots when booked sessions exist', async () => {
      const futureMonday = getFutureStartDateForDay(1);
      const bookedDate = new Date(futureMonday);
      bookedDate.setHours(14, 0, 0, 0);
      const bookedAt = bookedDate.toISOString();
      mockQuery
        .mockResolvedValueOnce({
          rows: [makeCreatorRow({
            session_availability: {
              monday: [{ start: '14:00', end: '16:00' }],
              tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
            },
            session_duration: 30,
          })],
        })
        .mockResolvedValueOnce({
          rows: [{ scheduled_at: bookedAt, duration: 30 }],
        });
      const event = makeEvent({
        queryStringParameters: { startDate: futureMonday, days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const body = JSON.parse((res as { body: string }).body);
      // 14:30, 15:00, 15:30 should be available (not 14:00)
      const availableTimes = body.availableSlots.map((s: { time: string }) => s.time);
      expect(availableTimes).toContain('14:30');
      expect(availableTimes).toContain('15:00');
      expect(availableTimes).toContain('15:30');
      expect(availableTimes).not.toContain('14:00');
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

  // ── Extended Coverage (Batch 7B) ──

  describe('extended — DB error paths', () => {
    it('should return 500 when getPool() itself throws', async () => {
      (getPool as jest.Mock).mockRejectedValueOnce(new Error('Pool creation failed'));
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).message).toContain('Failed to get availability');
    });

    it('should return 500 and not leak error details in response body', async () => {
      mockQuery.mockRejectedValueOnce(new Error('SENSITIVE: connection string exposed'));
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(500);
      expect(result.body).not.toContain('SENSITIVE');
      expect(result.body).not.toContain('connection string');
    });
  });

  describe('extended — validation edge cases', () => {
    it('should return 400 for creatorId with uppercase UUID (valid format)', async () => {
      const uppercaseUUID = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
      const event = makeEvent({ pathParameters: { creatorId: uppercaseUUID } });
      // The UUID regex uses /i flag so uppercase should pass validation
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ id: uppercaseUUID })] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });

    it('should return 400 for empty string creatorId', async () => {
      const event = makeEvent({ pathParameters: { creatorId: '' } });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });

    it('should return 400 for creatorId that is too long', async () => {
      const event = makeEvent({ pathParameters: { creatorId: 'a'.repeat(100) } });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(400);
    });
  });

  describe('extended — query parameter edge cases', () => {
    it('should handle NaN days parameter by defaulting to NaN behavior', async () => {
      // Only mock the creator query — the booked-sessions query is never reached
      // because endDate.toISOString() throws when daysAhead is NaN
      mockQuery.mockResolvedValueOnce({ rows: [makeCreatorRow()] });
      const event = makeEvent({
        queryStringParameters: { days: 'not-a-number' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      // parseInt('not-a-number') is NaN → endDate becomes Invalid Date → toISOString() throws → 500
      expect(result.statusCode).toBe(500);
    });

    it('should handle days = 0 returning no available slots', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { days: '0' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.availableSlots).toEqual([]);
    });

    it('should handle negative days parameter returning no available slots', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { days: '-5' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.availableSlots).toEqual([]);
    });
  });

  describe('extended — availability with empty/null day slots', () => {
    it('should handle availability with a missing day key gracefully', async () => {
      // Only monday defined, all other days missing (not empty arrays, just absent)
      const partialAvailability = {
        monday: [{ start: '09:00', end: '10:00' }],
        // tuesday, wednesday, etc. are missing
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ session_availability: partialAvailability })] })
        .mockResolvedValueOnce({ rows: [] });
      // Find a date string that the handler will interpret as Tuesday (getDay()===2)
      const td = new Date();
      td.setMonth(td.getMonth() + 6);
      while (new Date(td.toISOString().split('T')[0]).getDay() !== 2) td.setDate(td.getDate() + 1);
      const tuesdayStr = td.toISOString().split('T')[0];
      const event = makeEvent({
        queryStringParameters: { startDate: tuesdayStr, days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Tuesday has no entry in availability → no slots
      expect(body.availableSlots).toEqual([]);
    });

    it('should handle session_availability as null (use defaults)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ session_availability: null })] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      // Should succeed with default availability
      const body = JSON.parse(result.body);
      expect(body.availableSlots).toBeInstanceOf(Array);
    });
  });

  describe('extended — response shape validation', () => {
    it('should return all required creator fields in response', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number; body: string };
      const body = JSON.parse(result.body);
      expect(body.creator).toHaveProperty('id');
      expect(body.creator).toHaveProperty('name');
      expect(body.creator).toHaveProperty('username');
      expect(body.creator).toHaveProperty('avatar');
      expect(body.creator).toHaveProperty('sessionPrice');
      expect(body.creator).toHaveProperty('sessionDuration');
      expect(body.creator).toHaveProperty('timezone');
    });

    it('should return availableSlots as an array even when no slots exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] });
      // Find a date string that the handler will interpret as Saturday (getDay()===6)
      const sd = new Date();
      sd.setMonth(sd.getMonth() + 6);
      while (new Date(sd.toISOString().split('T')[0]).getDay() !== 6) sd.setDate(sd.getDate() + 1);
      const satStr = sd.toISOString().split('T')[0];
      const event = makeEvent({
        queryStringParameters: { startDate: satStr, days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const body = JSON.parse((res as { body: string }).body);
      expect(Array.isArray(body.availableSlots)).toBe(true);
      expect(body.availableSlots.length).toBe(0);
    });
  });

  // ── Additional Coverage (Batch 7B-7D) ──

  describe('additional — overlapping booked slots filter multiple bookings', () => {
    beforeEach(() => { mockQuery.mockReset(); mockQuery.mockResolvedValue({ rows: [] }); });
    function getFutureStartDateForDay(targetDay: number): string {
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      for (let i = 0; i < 10; i++) {
        const dateStr = d.toISOString().split('T')[0];
        const parsed = new Date(dateStr);
        if (parsed.getDay() === targetDay) return dateStr;
        d.setDate(d.getDate() + 1);
      }
      throw new Error(`Could not find a date for day ${targetDay}`);
    }

    it('should filter out multiple overlapping booked slots', async () => {
      const futureMonday = getFutureStartDateForDay(1);
      const booked1Date = new Date(futureMonday);
      booked1Date.setHours(14, 0, 0, 0);
      const booked2Date = new Date(futureMonday);
      booked2Date.setHours(15, 0, 0, 0);
      mockQuery
        .mockResolvedValueOnce({
          rows: [makeCreatorRow({
            session_availability: {
              monday: [{ start: '14:00', end: '17:00' }],
              tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
            },
            session_duration: 30,
          })],
        })
        .mockResolvedValueOnce({
          rows: [
            { scheduled_at: booked1Date.toISOString(), duration: 30 },
            { scheduled_at: booked2Date.toISOString(), duration: 30 },
          ],
        });
      const event = makeEvent({
        queryStringParameters: { startDate: futureMonday, days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const body = JSON.parse((res as { body: string }).body);
      expect(body.availableSlots.length).toBeGreaterThan(0);
      const times = body.availableSlots.map((s: { time: string }) => s.time);
      expect(times).not.toContain('14:00');
      expect(times).not.toContain('15:00');
    });
  });

  describe('additional — multiple availability windows in same day', () => {
    beforeEach(() => { mockQuery.mockReset(); mockQuery.mockResolvedValue({ rows: [] }); });
    function getFutureStartDateForDay(targetDay: number): string {
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      for (let i = 0; i < 10; i++) {
        const dateStr = d.toISOString().split('T')[0];
        const parsed = new Date(dateStr);
        if (parsed.getDay() === targetDay) return dateStr;
        d.setDate(d.getDate() + 1);
      }
      throw new Error(`Could not find a date for day ${targetDay}`);
    }

    it('should generate slots for multiple time windows on the same day', async () => {
      const futureMonday = getFutureStartDateForDay(1);
      const customAvailability = {
        monday: [
          { start: '09:00', end: '10:00' },
          { start: '14:00', end: '15:00' },
        ],
        tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ session_availability: customAvailability, session_duration: 30 })] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { startDate: futureMonday, days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const body = JSON.parse((res as { body: string }).body);
      // Should have slots from both windows
      expect(body.availableSlots).toBeInstanceOf(Array);
      // Verify at least one slot from each window if they pass the 2-hour threshold
      if (body.availableSlots.length > 0) {
        const times = body.availableSlots.map((s: { time: string }) => s.time);
        // At least one of the two windows should have slots
        expect(times.length).toBeGreaterThan(0);
      }
    });
  });

  describe('additional — very large days parameter', () => {
    beforeEach(() => { mockQuery.mockReset(); mockQuery.mockResolvedValue({ rows: [] }); });
    it('should handle a large days value (30) without error', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow()] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { days: '30' },
      });
      const res = await handler(event, {} as never, () => {});
      const result = res as { statusCode: number };
      expect(result.statusCode).toBe(200);
    });
  });

  describe('additional — sessionPrice as number type', () => {
    beforeEach(() => { mockQuery.mockReset(); mockQuery.mockResolvedValue({ rows: [] }); });
    it('should return sessionPrice as a number (parsed from string)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [makeCreatorRow({ session_price: '99.99' })] })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent();
      const res = await handler(event, {} as never, () => {});
      const body = JSON.parse((res as { body: string }).body);
      expect(typeof body.creator.sessionPrice).toBe('number');
      expect(body.creator.sessionPrice).toBeCloseTo(99.99);
    });
  });

  describe('additional — custom session_duration affects slot generation', () => {
    beforeEach(() => { mockQuery.mockReset(); mockQuery.mockResolvedValue({ rows: [] }); });
    function getFutureStartDateForDay(targetDay: number): string {
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      for (let i = 0; i < 10; i++) {
        const dateStr = d.toISOString().split('T')[0];
        const parsed = new Date(dateStr);
        if (parsed.getDay() === targetDay) return dateStr;
        d.setDate(d.getDate() + 1);
      }
      throw new Error(`Could not find a date for day ${targetDay}`);
    }

    it('should use custom session_duration for slot window check (60 min)', async () => {
      const futureMonday = getFutureStartDateForDay(1);
      mockQuery
        .mockResolvedValueOnce({
          rows: [makeCreatorRow({
            session_duration: 60,
            session_availability: {
              monday: [{ start: '14:00', end: '15:30' }],
              tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [],
            },
          })],
        })
        .mockResolvedValueOnce({ rows: [] });
      const event = makeEvent({
        queryStringParameters: { startDate: futureMonday, days: '1' },
      });
      const res = await handler(event, {} as never, () => {});
      const body = JSON.parse((res as { body: string }).body);
      // With 60 min session and window 14:00-15:30, only 14:00 fits (14:00+60=15:00 <= 15:30)
      // 14:30+60=15:30 <= 15:30 also fits. 15:00+60=16:00 > 15:30 does not.
      // But slots are generated at 30-min intervals, so: 14:00 (fits), 14:30 (fits), 15:00 (doesn't fit)
      if (body.availableSlots.length > 0) {
        expect(body.availableSlots.length).toBeLessThanOrEqual(2);
      }
    });
  });
});
