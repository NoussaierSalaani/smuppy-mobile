/**
 * API Error Class Tests
 * Tests for the custom APIError class.
 */

import { APIError } from '../../../services/api/error';

describe('APIError', () => {
  it('should create an error with message and status code', () => {
    const error = new APIError('Not Found', 404);
    expect(error.message).toBe('Not Found');
    expect(error.statusCode).toBe(404);
    expect(error.name).toBe('APIError');
  });

  it('should be an instance of Error', () => {
    const error = new APIError('Server Error', 500);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(APIError);
  });

  it('should include optional data', () => {
    const data = { field: 'email', reason: 'already exists' };
    const error = new APIError('Conflict', 409, data);
    expect(error.data).toEqual(data);
  });

  it('should have undefined data when not provided', () => {
    const error = new APIError('Bad Request', 400);
    expect(error.data).toBeUndefined();
  });

  it('should work with common HTTP status codes', () => {
    expect(new APIError('Bad Request', 400).statusCode).toBe(400);
    expect(new APIError('Unauthorized', 401).statusCode).toBe(401);
    expect(new APIError('Forbidden', 403).statusCode).toBe(403);
    expect(new APIError('Not Found', 404).statusCode).toBe(404);
    expect(new APIError('Too Many Requests', 429).statusCode).toBe(429);
    expect(new APIError('Internal Server Error', 500).statusCode).toBe(500);
  });

  it('should have a stack trace', () => {
    const error = new APIError('Test', 500);
    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });
});
