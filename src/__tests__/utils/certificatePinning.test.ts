/**
 * Certificate Pinning / Host Allowlist Tests
 * Tests for secureFetch host validation and request behavior.
 */

// Mock dependencies before imports
jest.mock('../../config/env', () => ({
  ENV: { isDev: false },
}));

jest.mock('../../lib/sentry', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

jest.mock('../../config/aws-config', () => ({
  AWS_CONFIG: {
    api: {
      restEndpoint: 'https://api-rest.example.com/staging',
      restEndpoint2: 'https://api-rest2.example.com/staging',
      restEndpoint3: 'https://api-rest3.example.com/staging',
    },
    storage: {
      cdnDomain: 'https://cdn.example.com',
    },
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import { secureFetch } from '../../utils/certificatePinning';
import { captureException, addBreadcrumb } from '../../lib/sentry';

describe('Certificate Pinning / Host Allowlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));
  });

  describe('secureFetch', () => {
    it('should allow requests to static allowed hosts', async () => {
      const response = await secureFetch('https://api.smuppy.com/test');
      expect(response).toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
      expect(addBreadcrumb).toHaveBeenCalledWith(
        'Allowed request to api.smuppy.com',
        'http'
      );
    });

    it('should allow requests to Expo push host', async () => {
      const response = await secureFetch('https://exp.host/push/send');
      expect(response).toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should allow requests to Sentry ingest host', async () => {
      const response = await secureFetch('https://o4510698053959680.ingest.us.sentry.io/api');
      expect(response).toBeDefined();
    });

    it('should allow requests to dynamically added AWS config hosts', async () => {
      const response = await secureFetch('https://api-rest.example.com/staging/endpoint');
      expect(response).toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should allow requests to CDN domain from AWS config', async () => {
      const response = await secureFetch('https://cdn.example.com/image.jpg');
      expect(response).toBeDefined();
    });

    it('should block requests to untrusted hosts', async () => {
      await expect(secureFetch('https://evil.example.com/steal-data')).rejects.toThrow(
        'Untrusted host: evil.example.com'
      );
      expect(mockFetch).not.toHaveBeenCalled();
      expect(captureException).toHaveBeenCalled();
    });

    it('should block requests to random domains', async () => {
      await expect(secureFetch('https://random-domain.xyz/api')).rejects.toThrow(
        'Untrusted host'
      );
    });

    it('should add X-Requested-With header to allowed requests', async () => {
      await secureFetch('https://api.smuppy.com/test');
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers['X-Requested-With']).toBe('SmuppyApp');
    });

    it('should merge provided options with default headers', async () => {
      await secureFetch('https://api.smuppy.com/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].method).toBe('POST');
      expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
      expect(fetchCall[1].headers['X-Requested-With']).toBe('SmuppyApp');
    });

    it('should capture exception and re-throw on untrusted host', async () => {
      try {
        await secureFetch('https://evil.com/data');
      } catch {
        // expected
      }
      expect(captureException).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ url: 'https://evil.com/data', type: 'secure_fetch' })
      );
    });

    it('should capture exception and re-throw on fetch error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      await expect(secureFetch('https://api.smuppy.com/test')).rejects.toThrow('Network error');
      expect(captureException).toHaveBeenCalled();
    });

    it('should allow requests to known CloudFront distribution', async () => {
      const response = await secureFetch('https://d3gy4x1feicix3.cloudfront.net/image.jpg');
      expect(response).toBeDefined();
    });

    it('should allow requests to known API Gateway endpoints', async () => {
      const response = await secureFetch(
        'https://bmkd8zayee.execute-api.us-east-1.amazonaws.com/staging/test'
      );
      expect(response).toBeDefined();
    });
  });
});
