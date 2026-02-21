/**
 * Tests for admin/refresh-bot-peaks Lambda handler
 * Validates bot peaks refresh logic (EventBridge-triggered, no admin key check)
 */

import { createMockDbWithTransaction } from '../helpers';
import type { MockClient, MockDbWithTransaction } from '../helpers';

import { handler } from '../../admin/refresh-bot-peaks';

describe('admin/refresh-bot-peaks handler', () => {
  let mockDb: MockDbWithTransaction;
  let mockClient: MockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    const mocks = createMockDbWithTransaction();
    mockDb = mocks.mockDb;
    mockClient = mocks.mockClient;
  });

  it('should delete old bot peaks and create new ones', async () => {
    // DELETE returns rowCount
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rowCount: 4, rows: [] })  // DELETE old peaks
      .mockResolvedValueOnce({                            // SELECT bot creators
        rows: [
          { id: 'creator-1', expertise: ['Personal Training'] },
          { id: 'creator-2', expertise: ['Combat Sports'] },
        ],
      })
      .mockResolvedValue({ rows: [] });                   // INSERT peaks (multiple calls)

    const result = await handler();
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.message).toBe('Bot peaks refreshed');
    expect(body.deletedPeaks).toBe(4);
    expect(body.createdPeaks).toBe(4); // 2 creators x 2 peaks each
    expect(body.creators).toBe(2);
  });

  it('should commit transaction on success', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })  // DELETE
      .mockResolvedValueOnce({ rows: [] })               // SELECT creators (none)
      .mockResolvedValueOnce({ rows: [] });              // COMMIT

    await handler();

    const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls[0]).toBe('BEGIN');
    expect(calls).toContain('COMMIT');
  });

  it('should release client in finally block', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })  // DELETE
      .mockResolvedValueOnce({ rows: [] })               // SELECT creators
      .mockResolvedValueOnce({ rows: [] });              // COMMIT

    await handler();
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should rollback and throw on database error', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockRejectedValueOnce(new Error('DB failure'));    // DELETE fails

    await expect(handler()).rejects.toThrow('DB failure');

    const calls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(calls).toContain('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('should handle zero bot creators gracefully', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })  // DELETE
      .mockResolvedValueOnce({ rows: [] })               // SELECT creators (empty)
      .mockResolvedValueOnce({ rows: [] });              // COMMIT

    const result = await handler();
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.createdPeaks).toBe(0);
    expect(body.creators).toBe(0);
  });

  it('should use training captions when expertise is empty', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })  // DELETE
      .mockResolvedValueOnce({                            // SELECT creators
        rows: [{ id: 'creator-empty', expertise: [] }],
      })
      .mockResolvedValue({ rows: [] });                   // INSERT peaks + COMMIT

    const result = await handler();
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.createdPeaks).toBe(2);
  });

  it('should use training captions when expertise is null', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })  // DELETE
      .mockResolvedValueOnce({                            // SELECT creators
        rows: [{ id: 'creator-null', expertise: null }],
      })
      .mockResolvedValue({ rows: [] });                   // INSERT peaks + COMMIT

    const result = await handler();
    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.createdPeaks).toBe(2);
  });

  it('should create exactly 2 peaks per creator', async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })               // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })  // DELETE
      .mockResolvedValueOnce({                            // SELECT creators
        rows: [
          { id: 'c1', expertise: ['Personal Training'] },
          { id: 'c2', expertise: ['Mind & Wellness'] },
          { id: 'c3', expertise: ['Combat Sports'] },
        ],
      })
      .mockResolvedValue({ rows: [] });                   // INSERT peaks + COMMIT

    const result = await handler();
    const body = JSON.parse(result.body);
    expect(body.createdPeaks).toBe(6); // 3 creators x 2 peaks
    expect(body.creators).toBe(3);
  });
});
