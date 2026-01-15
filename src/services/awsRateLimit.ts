/**
 * AWS Rate Limiter Service
 * Server-side rate limiting via AWS Lambda + API Gateway
 * Cannot be bypassed by client manipulation
 */

const API_URL = 'https://xziuizbmph.execute-api.us-east-1.amazonaws.com/rate-limit';
const API_KEY = 'ktwHk/j6ZX3zXqYo8yPH0agm5VJ0T5CtBH9QCbdMaps=';

export interface AWSRateLimitResult {
  allowed: boolean;
  remaining?: number;
  retryAfter?: number;
  error?: string;
}

export const checkAWSRateLimit = async (
  email: string,
  action: string = 'auth-resend'
): Promise<AWSRateLimitResult> => {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
      body: JSON.stringify({ email, action }),
    });

    const data = await response.json();

    if (response.status === 429) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: data.retry_after || 300,
        error: data.error || 'Too many attempts',
      };
    }

    if (response.status === 200) {
      return {
        allowed: data.allowed ?? true,
        remaining: data.remaining ?? 0,
      };
    }

    console.warn('AWS Rate Limit unexpected response:', response.status);
    return { allowed: true };

  } catch (error) {
    console.warn('AWS Rate Limit error:', error);
    return { allowed: true };
  }
};

export default checkAWSRateLimit;
