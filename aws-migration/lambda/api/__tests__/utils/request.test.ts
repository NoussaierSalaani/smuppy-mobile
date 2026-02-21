import { makeEvent } from '../helpers';
import { parseBody, isParseError } from '../../utils/request';

const headers = { 'Content-Type': 'application/json' };

describe('parseBody', () => {
  it('parses valid JSON body', () => {
    const event = makeEvent({ body: JSON.stringify({ name: 'test' }) });
    const result = parseBody(event, headers);
    expect(result).toEqual({ name: 'test' });
  });

  it('returns empty object when body is null', () => {
    const event = makeEvent({ body: null });
    const result = parseBody(event, headers);
    expect(result).toEqual({});
  });

  it('returns empty object when body is empty string', () => {
    const event = makeEvent({ body: '' });
    const result = parseBody(event, headers);
    expect(result).toEqual({});
  });

  it('returns 400 error response for invalid JSON', () => {
    const event = makeEvent({ body: '{not-json' });
    const result = parseBody(event, headers);
    expect(isParseError(result)).toBe(true);
    expect(result).toMatchObject({
      statusCode: 400,
      headers,
    });
    const body = JSON.parse((result as { body: string }).body);
    expect(body.success).toBe(false);
    expect(body.message).toBe('Invalid JSON body');
  });

  it('parses nested JSON objects', () => {
    const event = makeEvent({ body: JSON.stringify({ a: { b: [1, 2] } }) });
    const result = parseBody(event, headers);
    expect(result).toEqual({ a: { b: [1, 2] } });
  });

  it('parses JSON arrays', () => {
    const event = makeEvent({ body: JSON.stringify([1, 2, 3]) });
    const result = parseBody(event, headers);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe('isParseError', () => {
  it('returns true for objects with statusCode', () => {
    expect(isParseError({ statusCode: 400, body: '' })).toBe(true);
  });

  it('returns false for plain objects without statusCode', () => {
    expect(isParseError({ name: 'test' })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isParseError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isParseError(undefined)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isParseError('string')).toBe(false);
    expect(isParseError(42)).toBe(false);
  });
});
