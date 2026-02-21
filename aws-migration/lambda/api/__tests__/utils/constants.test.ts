/**
 * Constants Unit Tests
 *
 * Verifies exported constants have correct values and types.
 * Prevents accidental changes to business-critical constants.
 */

import {
  // Pagination
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,

  // Rate Limit Windows
  RATE_WINDOW_30S,
  RATE_WINDOW_1_MIN,
  RATE_WINDOW_5_MIN,
  RATE_WINDOW_1_HOUR,
  RATE_WINDOW_1_DAY,

  // File Size Limits
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  MAX_AUDIO_SIZE_BYTES,
  MAX_VOICE_SIZE_BYTES,

  // Text Length Limits
  MAX_MESSAGE_LENGTH,
  MAX_POST_CONTENT_LENGTH,
  MAX_REPORT_REASON_LENGTH,
  MAX_REPORT_DETAILS_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,

  // Payment Amounts
  MIN_PAYMENT_CENTS,
  MAX_PAYMENT_CENTS,
  MAX_TIP_AMOUNT_CENTS,
  VERIFICATION_FEE_CENTS,

  // Platform Fees
  PLATFORM_FEE_PERCENT,
  APPLE_FEE_PERCENT,
  GOOGLE_FEE_PERCENT,

  // Duration Limits
  MAX_VOICE_MESSAGE_SECONDS,
  MAX_PEAK_DURATION_SECONDS,

  // Presigned URL
  PRESIGNED_URL_EXPIRY_SECONDS,

  // Webhook
  MAX_WEBHOOK_EVENT_AGE_SECONDS,

  // Upload Quota
  PERSONAL_DAILY_VIDEO_SECONDS,
  PERSONAL_MAX_VIDEO_SECONDS,
  PERSONAL_DAILY_PHOTO_COUNT,
  PERSONAL_DAILY_PEAK_COUNT,
  PERSONAL_VIDEO_RENDITIONS,
  PRO_MAX_VIDEO_SECONDS,
  PRO_VIDEO_RENDITIONS,

  // Video Pipeline
  VIDEO_STATUS_UPLOADED,
  VIDEO_STATUS_PROCESSING,
  VIDEO_STATUS_READY,
  VIDEO_STATUS_FAILED,

  // Cache TTL
  HSTS_MAX_AGE,
  HSTS_MAX_AGE_PRELOAD,

  // Platform
  PLATFORM_NAME,
} from '../../utils/constants';

describe('Constants', () => {
  describe('Pagination', () => {
    it('should have DEFAULT_PAGE_SIZE of 20', () => {
      expect(DEFAULT_PAGE_SIZE).toBe(20);
    });

    it('should have MAX_PAGE_SIZE of 50', () => {
      expect(MAX_PAGE_SIZE).toBe(50);
    });

    it('should have MAX_PAGE_SIZE >= DEFAULT_PAGE_SIZE', () => {
      expect(MAX_PAGE_SIZE).toBeGreaterThanOrEqual(DEFAULT_PAGE_SIZE);
    });
  });

  describe('Rate Limit Windows', () => {
    it('should have correct rate limit window values in seconds', () => {
      expect(RATE_WINDOW_30S).toBe(30);
      expect(RATE_WINDOW_1_MIN).toBe(60);
      expect(RATE_WINDOW_5_MIN).toBe(300);
      expect(RATE_WINDOW_1_HOUR).toBe(3600);
      expect(RATE_WINDOW_1_DAY).toBe(86400);
    });

    it('should have windows in ascending order', () => {
      expect(RATE_WINDOW_30S).toBeLessThan(RATE_WINDOW_1_MIN);
      expect(RATE_WINDOW_1_MIN).toBeLessThan(RATE_WINDOW_5_MIN);
      expect(RATE_WINDOW_5_MIN).toBeLessThan(RATE_WINDOW_1_HOUR);
      expect(RATE_WINDOW_1_HOUR).toBeLessThan(RATE_WINDOW_1_DAY);
    });
  });

  describe('File Size Limits', () => {
    it('should have MAX_IMAGE_SIZE_BYTES as 10 MB', () => {
      expect(MAX_IMAGE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    });

    it('should have MAX_VIDEO_SIZE_BYTES as 100 MB', () => {
      expect(MAX_VIDEO_SIZE_BYTES).toBe(100 * 1024 * 1024);
    });

    it('should have MAX_AUDIO_SIZE_BYTES as 20 MB', () => {
      expect(MAX_AUDIO_SIZE_BYTES).toBe(20 * 1024 * 1024);
    });

    it('should have MAX_VOICE_SIZE_BYTES as 5 MB', () => {
      expect(MAX_VOICE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    });
  });

  describe('Text Length Limits', () => {
    it('should have correct text length limits', () => {
      expect(MAX_MESSAGE_LENGTH).toBe(5000);
      expect(MAX_POST_CONTENT_LENGTH).toBe(5000);
      expect(MAX_REPORT_REASON_LENGTH).toBe(100);
      expect(MAX_REPORT_DETAILS_LENGTH).toBe(1000);
      expect(MAX_SEARCH_QUERY_LENGTH).toBe(100);
    });
  });

  describe('Payment Amounts', () => {
    it('should have MIN_PAYMENT_CENTS as $1.00', () => {
      expect(MIN_PAYMENT_CENTS).toBe(100);
    });

    it('should have MAX_PAYMENT_CENTS as $50,000', () => {
      expect(MAX_PAYMENT_CENTS).toBe(5_000_000);
    });

    it('should have MAX_TIP_AMOUNT_CENTS as $500', () => {
      expect(MAX_TIP_AMOUNT_CENTS).toBe(50_000);
    });

    it('should have VERIFICATION_FEE_CENTS as $14.90', () => {
      expect(VERIFICATION_FEE_CENTS).toBe(1490);
    });

    it('should have MIN < MAX payment amounts', () => {
      expect(MIN_PAYMENT_CENTS).toBeLessThan(MAX_PAYMENT_CENTS);
    });
  });

  describe('Platform Fees', () => {
    it('should have correct fee percentages', () => {
      expect(PLATFORM_FEE_PERCENT).toBe(20);
      expect(APPLE_FEE_PERCENT).toBe(30);
      expect(GOOGLE_FEE_PERCENT).toBe(30);
    });
  });

  describe('Duration Limits', () => {
    it('should have correct duration limits', () => {
      expect(MAX_VOICE_MESSAGE_SECONDS).toBe(300);
      expect(MAX_PEAK_DURATION_SECONDS).toBe(60);
    });
  });

  describe('Presigned URL and Webhook', () => {
    it('should have PRESIGNED_URL_EXPIRY_SECONDS as 5 minutes', () => {
      expect(PRESIGNED_URL_EXPIRY_SECONDS).toBe(300);
    });

    it('should have MAX_WEBHOOK_EVENT_AGE_SECONDS as 5 minutes', () => {
      expect(MAX_WEBHOOK_EVENT_AGE_SECONDS).toBe(300);
    });
  });

  describe('Upload Quota Limits', () => {
    it('should have correct personal account limits', () => {
      expect(PERSONAL_DAILY_VIDEO_SECONDS).toBe(60);
      expect(PERSONAL_MAX_VIDEO_SECONDS).toBe(60);
      expect(PERSONAL_DAILY_PHOTO_COUNT).toBe(10);
      expect(PERSONAL_DAILY_PEAK_COUNT).toBe(10);
      expect(PERSONAL_VIDEO_RENDITIONS).toBe(1);
    });

    it('should have correct pro account limits', () => {
      expect(PRO_MAX_VIDEO_SECONDS).toBe(300);
      expect(PRO_VIDEO_RENDITIONS).toBe(3);
    });

    it('should have pro limits greater than personal limits', () => {
      expect(PRO_MAX_VIDEO_SECONDS).toBeGreaterThan(PERSONAL_MAX_VIDEO_SECONDS);
      expect(PRO_VIDEO_RENDITIONS).toBeGreaterThan(PERSONAL_VIDEO_RENDITIONS);
    });
  });

  describe('Video Pipeline Statuses', () => {
    it('should have correct video status strings', () => {
      expect(VIDEO_STATUS_UPLOADED).toBe('uploaded');
      expect(VIDEO_STATUS_PROCESSING).toBe('processing');
      expect(VIDEO_STATUS_READY).toBe('ready');
      expect(VIDEO_STATUS_FAILED).toBe('failed');
    });
  });

  describe('Cache and Security', () => {
    it('should have HSTS_MAX_AGE as 1 year in seconds', () => {
      expect(HSTS_MAX_AGE).toBe(31_536_000);
    });

    it('should have HSTS_MAX_AGE_PRELOAD as 2 years in seconds', () => {
      expect(HSTS_MAX_AGE_PRELOAD).toBe(63_072_000);
    });

    it('should have preload max-age greater than standard', () => {
      expect(HSTS_MAX_AGE_PRELOAD).toBeGreaterThan(HSTS_MAX_AGE);
    });
  });

  describe('Platform Identity', () => {
    it('should have correct platform name', () => {
      expect(PLATFORM_NAME).toBe('smuppy');
    });
  });
});
