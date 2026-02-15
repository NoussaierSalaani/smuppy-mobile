/**
 * Custom API Error class
 * Extracted from aws-api.ts — re-exported from there for backwards compatibility.
 */

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'APIError';
  }
}
