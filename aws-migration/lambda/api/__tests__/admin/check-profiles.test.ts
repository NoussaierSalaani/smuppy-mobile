/**
 * Tests for admin/check-profiles Lambda handler
 * Validates admin key verification and profile stats retrieval
 */

import { makeEvent, createMockDb } from '../helpers';
import type { MockDb } from '../helpers';

// Mock shared/secrets — check-profiles imports getAdminKey from ../../shared/secrets
jest.mock('../../../shared/secrets', () => ({
  getAdminKey: jest.fn().mockResolvedValue('test-admin-key'),
}));

import { handler } from '../../admin/check-profiles';

describe('admin/check-profiles handler', () => {
  let mockDb: MockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
  });

  it('should return 403 when x-admin-key header is missing', async () => {
    const event = makeEvent({ headers: {} });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('Forbidden');
  });

  it('should return 403 when admin key is wrong', async () => {
    const event = makeEvent({
      headers: { 'x-admin-key': 'wrong-key' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).message).toBe('Forbidden');
  });

  it('should return 200 with stats and samples when admin key is valid', async () => {
    const statsRow = { total: '100', with_cognito: '90', without_cognito: '10' };
    const sampleRows = [
      { id: 'uuid-1', username: 'al***', cognito_sub: 'abc12345***' },
      { id: 'uuid-2', username: 'bo***', cognito_sub: 'def67890***' },
    ];

    mockDb.query
      .mockResolvedValueOnce({ rows: [statsRow] })   // stats query
      .mockResolvedValueOnce({ rows: sampleRows });   // sample query

    const event = makeEvent({
      headers: { 'x-admin-key': 'test-admin-key' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.stats).toEqual(statsRow);
    expect(body.samples).toEqual(sampleRows);
  });

  it('should accept X-Admin-Key header (case variant)', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ total: '0', with_cognito: '0', without_cognito: '0' }] })
      .mockResolvedValueOnce({ rows: [] });

    const event = makeEvent({
      headers: { 'X-Admin-Key': 'test-admin-key' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
  });

  it('should return 500 when database query fails', async () => {
    mockDb.query.mockRejectedValueOnce(new Error('DB connection failed'));

    const event = makeEvent({
      headers: { 'x-admin-key': 'test-admin-key' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Internal server error');
  });

  it('should return 403 when key has different length', async () => {
    const event = makeEvent({
      headers: { 'x-admin-key': 'short' },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(403);
  });
});
