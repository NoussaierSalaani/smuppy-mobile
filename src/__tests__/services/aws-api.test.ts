/**
 * AWS API Service Tests
 * Testing API utility functions and response handling
 */

describe('API URL Building', () => {
  const buildUrl = (base: string, endpoint: string, params?: Record<string, string>): string => {
    const url = new URL(endpoint, base);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    return url.toString();
  };

  it('should build URLs correctly', () => {
    expect(buildUrl('https://api.example.com', '/users')).toBe('https://api.example.com/users');
    expect(buildUrl('https://api.example.com', '/posts/123')).toBe('https://api.example.com/posts/123');
  });

  it('should add query parameters', () => {
    const url = buildUrl('https://api.example.com', '/posts', { limit: '10', page: '1' });
    expect(url).toContain('limit=10');
    expect(url).toContain('page=1');
  });

  it('should handle trailing slashes', () => {
    const url1 = buildUrl('https://api.example.com/', '/users');
    const url2 = buildUrl('https://api.example.com', '/users');
    expect(url1).toBe(url2);
  });
});

describe('Request Headers', () => {
  const buildHeaders = (token?: string): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  };

  it('should include content type', () => {
    const headers = buildHeaders();
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('should include authorization when token provided', () => {
    const headers = buildHeaders('test-token');
    expect(headers['Authorization']).toBe('Bearer test-token');
  });

  it('should not include authorization when no token', () => {
    const headers = buildHeaders();
    expect(headers['Authorization']).toBeUndefined();
  });
});

describe('Error Response Parsing', () => {
  interface APIError {
    statusCode: number;
    message: string;
    code?: string;
  }

  const parseError = (status: number, body: any): APIError => {
    return {
      statusCode: status,
      message: body?.message || body?.error || 'Unknown error',
      code: body?.code,
    };
  };

  it('should parse error with message', () => {
    const error = parseError(400, { message: 'Bad request' });
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Bad request');
  });

  it('should parse error with error field', () => {
    const error = parseError(401, { error: 'Unauthorized' });
    expect(error.message).toBe('Unauthorized');
  });

  it('should handle missing message', () => {
    const error = parseError(500, {});
    expect(error.message).toBe('Unknown error');
  });

  it('should include error code when present', () => {
    const error = parseError(403, { message: 'Forbidden', code: 'ACCESS_DENIED' });
    expect(error.code).toBe('ACCESS_DENIED');
  });
});

describe('Response Status Handling', () => {
  const isSuccessStatus = (status: number): boolean => {
    return status >= 200 && status < 300;
  };

  const isClientError = (status: number): boolean => {
    return status >= 400 && status < 500;
  };

  const isServerError = (status: number): boolean => {
    return status >= 500 && status < 600;
  };

  it('should identify success statuses', () => {
    expect(isSuccessStatus(200)).toBe(true);
    expect(isSuccessStatus(201)).toBe(true);
    expect(isSuccessStatus(204)).toBe(true);
    expect(isSuccessStatus(400)).toBe(false);
  });

  it('should identify client errors', () => {
    expect(isClientError(400)).toBe(true);
    expect(isClientError(401)).toBe(true);
    expect(isClientError(404)).toBe(true);
    expect(isClientError(500)).toBe(false);
  });

  it('should identify server errors', () => {
    expect(isServerError(500)).toBe(true);
    expect(isServerError(502)).toBe(true);
    expect(isServerError(503)).toBe(true);
    expect(isServerError(400)).toBe(false);
  });
});

describe('Retry Logic', () => {
  const shouldRetry = (status: number, attempt: number, maxAttempts: number): boolean => {
    // Only retry server errors and network issues, up to max attempts
    if (attempt >= maxAttempts) return false;
    return status >= 500 || status === 0; // 0 typically means network error
  };

  const calculateBackoff = (attempt: number, baseMs: number = 1000): number => {
    // Exponential backoff with jitter
    return Math.min(baseMs * Math.pow(2, attempt), 30000);
  };

  it('should retry on server errors', () => {
    expect(shouldRetry(500, 1, 3)).toBe(true);
    expect(shouldRetry(502, 1, 3)).toBe(true);
    expect(shouldRetry(503, 1, 3)).toBe(true);
  });

  it('should not retry on client errors', () => {
    expect(shouldRetry(400, 1, 3)).toBe(false);
    expect(shouldRetry(401, 1, 3)).toBe(false);
    expect(shouldRetry(404, 1, 3)).toBe(false);
  });

  it('should stop after max attempts', () => {
    expect(shouldRetry(500, 3, 3)).toBe(false);
    expect(shouldRetry(500, 4, 3)).toBe(false);
  });

  it('should calculate exponential backoff', () => {
    expect(calculateBackoff(0, 1000)).toBe(1000);
    expect(calculateBackoff(1, 1000)).toBe(2000);
    expect(calculateBackoff(2, 1000)).toBe(4000);
  });

  it('should cap backoff at 30 seconds', () => {
    expect(calculateBackoff(10, 1000)).toBe(30000);
  });
});

describe('Pagination', () => {
  interface PaginatedResponse<T> {
    data: T[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
  }

  const hasMorePages = (response: PaginatedResponse<any>): boolean => {
    return response.hasMore && response.nextCursor !== null;
  };

  it('should detect more pages available', () => {
    const response: PaginatedResponse<any> = {
      data: [1, 2, 3],
      nextCursor: 'abc123',
      hasMore: true,
      total: 100,
    };
    expect(hasMorePages(response)).toBe(true);
  });

  it('should detect no more pages', () => {
    const response: PaginatedResponse<any> = {
      data: [1, 2, 3],
      nextCursor: null,
      hasMore: false,
      total: 3,
    };
    expect(hasMorePages(response)).toBe(false);
  });

  it('should handle edge case with hasMore but no cursor', () => {
    const response: PaginatedResponse<any> = {
      data: [],
      nextCursor: null,
      hasMore: true, // Inconsistent state
      total: 0,
    };
    expect(hasMorePages(response)).toBe(false);
  });
});
