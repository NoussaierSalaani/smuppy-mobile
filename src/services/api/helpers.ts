import { APIError } from './error';

const MEDIA_NOT_READY_MAX_ATTEMPTS = 10;
const MEDIA_NOT_READY_BASE_DELAY_MS = 1500;

declare const __DEV__: boolean;

export function isMediaNotReadyError(error: unknown): boolean {
  if (!(error instanceof APIError)) return false;
  if (error.statusCode !== 409) return false;
  const code = typeof error.data?.code === 'string' ? error.data.code : '';
  return code === 'MEDIA_NOT_READY' || error.message.toLowerCase().includes('still processing');
}

export async function withMediaReadyRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = MEDIA_NOT_READY_MAX_ATTEMPTS,
  baseDelayMs = MEDIA_NOT_READY_BASE_DELAY_MS,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error_) {
      const shouldRetry = isMediaNotReadyError(error_) && attempt < maxAttempts;
      if (!shouldRetry) throw error_;

      const delay = process.env.NODE_ENV === 'test' ? 0 : baseDelayMs * attempt;
      if (__DEV__ && process.env.NODE_ENV !== 'test') {
        console.log(`[AWS API] MEDIA_NOT_READY retry ${attempt}/${maxAttempts - 1} in ${delay}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Unreachable: loop always returns or throws.
  throw new APIError('Media is still processing', 409, { code: 'MEDIA_NOT_READY' });
}
