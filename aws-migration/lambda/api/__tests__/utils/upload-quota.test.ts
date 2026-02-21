/**
 * Upload Quota Utility Unit Tests
 *
 * Tests daily upload quota enforcement:
 * - isPremiumAccount for each account type
 * - getQuotaLimits for personal vs pro accounts
 * - checkQuota allowed/blocked/unlimited
 * - deductQuota success/failure
 * - getQuotaUsage aggregation
 */

// Mock DynamoDB before imports
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  GetItemCommand: jest.fn((input: unknown) => ({ input, _type: 'GetItemCommand' })),
  UpdateItemCommand: jest.fn((input: unknown) => ({ input, _type: 'UpdateItemCommand' })),
}));

import {
  isPremiumAccount,
  getQuotaLimits,
  checkQuota,
  deductQuota,
  getQuotaUsage,
} from '../../utils/upload-quota';

import {
  PERSONAL_DAILY_VIDEO_SECONDS,
  PERSONAL_MAX_VIDEO_SECONDS,
  PERSONAL_MAX_VIDEO_SIZE_BYTES,
  PERSONAL_DAILY_PHOTO_COUNT,
  PERSONAL_DAILY_PEAK_COUNT,
  PERSONAL_VIDEO_RENDITIONS,
  PRO_MAX_VIDEO_SECONDS,
  PRO_MAX_VIDEO_SIZE_BYTES,
  PRO_VIDEO_RENDITIONS,
} from '../../utils/constants';

beforeEach(() => {
  mockSend.mockReset();
});

describe('Upload Quota Utility', () => {
  describe('isPremiumAccount', () => {
    it('should return false for personal account', () => {
      expect(isPremiumAccount('personal')).toBe(false);
    });

    it('should return true for pro_creator account', () => {
      expect(isPremiumAccount('pro_creator')).toBe(true);
    });

    it('should return true for pro_business account', () => {
      expect(isPremiumAccount('pro_business')).toBe(true);
    });

    it('should return false for unknown account type', () => {
      expect(isPremiumAccount('free')).toBe(false);
      expect(isPremiumAccount('')).toBe(false);
    });
  });

  describe('getQuotaLimits', () => {
    it('should return personal limits for personal account', () => {
      const limits = getQuotaLimits('personal');

      expect(limits.dailyVideoSeconds).toBe(PERSONAL_DAILY_VIDEO_SECONDS);
      expect(limits.maxVideoSeconds).toBe(PERSONAL_MAX_VIDEO_SECONDS);
      expect(limits.maxVideoSizeBytes).toBe(PERSONAL_MAX_VIDEO_SIZE_BYTES);
      expect(limits.dailyPhotoCount).toBe(PERSONAL_DAILY_PHOTO_COUNT);
      expect(limits.dailyPeakCount).toBe(PERSONAL_DAILY_PEAK_COUNT);
      expect(limits.videoRenditions).toBe(PERSONAL_VIDEO_RENDITIONS);
    });

    it('should return unlimited daily quotas for pro_creator', () => {
      const limits = getQuotaLimits('pro_creator');

      expect(limits.dailyVideoSeconds).toBeNull();
      expect(limits.dailyPhotoCount).toBeNull();
      expect(limits.dailyPeakCount).toBeNull();
      expect(limits.maxVideoSeconds).toBe(PRO_MAX_VIDEO_SECONDS);
      expect(limits.maxVideoSizeBytes).toBe(PRO_MAX_VIDEO_SIZE_BYTES);
      expect(limits.videoRenditions).toBe(PRO_VIDEO_RENDITIONS);
    });

    it('should return unlimited daily quotas for pro_business', () => {
      const limits = getQuotaLimits('pro_business');

      expect(limits.dailyVideoSeconds).toBeNull();
      expect(limits.dailyPhotoCount).toBeNull();
      expect(limits.dailyPeakCount).toBeNull();
    });

    it('should return personal limits for unknown account type', () => {
      const limits = getQuotaLimits('unknown');

      expect(limits.dailyVideoSeconds).toBe(PERSONAL_DAILY_VIDEO_SECONDS);
      expect(limits.dailyPhotoCount).toBe(PERSONAL_DAILY_PHOTO_COUNT);
    });
  });

  describe('checkQuota', () => {
    it('should return unlimited for pro_creator video quota', async () => {
      const result = await checkQuota('user-1', 'pro_creator', 'video', 30);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeNull();
      expect(result.limit).toBeNull();
      // Should not call DynamoDB for unlimited accounts
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should return unlimited for pro_business photo quota', async () => {
      const result = await checkQuota('user-1', 'pro_business', 'photo', 1);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeNull();
      expect(result.limit).toBeNull();
    });

    it('should allow personal video quota when under limit', async () => {
      mockSend.mockResolvedValue({
        Item: { count: { N: '10' } },
      });

      const result = await checkQuota('user-1', 'personal', 'video', 5);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(PERSONAL_DAILY_VIDEO_SECONDS - 10);
      expect(result.limit).toBe(PERSONAL_DAILY_VIDEO_SECONDS);
    });

    it('should block personal video quota when over limit', async () => {
      mockSend.mockResolvedValue({
        Item: { count: { N: String(PERSONAL_DAILY_VIDEO_SECONDS) } },
      });

      const result = await checkQuota('user-1', 'personal', 'video', 5);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(PERSONAL_DAILY_VIDEO_SECONDS);
    });

    it('should allow personal photo quota when under limit', async () => {
      mockSend.mockResolvedValue({
        Item: { count: { N: '5' } },
      });

      const result = await checkQuota('user-1', 'personal', 'photo', 1);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(PERSONAL_DAILY_PHOTO_COUNT);
    });

    it('should allow personal peak quota when under limit', async () => {
      mockSend.mockResolvedValue({
        Item: { count: { N: '3' } },
      });

      const result = await checkQuota('user-1', 'personal', 'peak', 1);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(PERSONAL_DAILY_PEAK_COUNT);
    });

    it('should treat missing DynamoDB item as zero usage', async () => {
      mockSend.mockResolvedValue({ Item: undefined });

      const result = await checkQuota('user-1', 'personal', 'video', 1);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(PERSONAL_DAILY_VIDEO_SECONDS);
    });

    it('should handle DynamoDB read failure gracefully (default to 0)', async () => {
      mockSend.mockRejectedValue(new Error('DynamoDB unavailable'));

      const result = await checkQuota('user-1', 'personal', 'photo', 1);

      // getCounter returns 0 on error, so quota is allowed
      expect(result.allowed).toBe(true);
    });
  });

  describe('deductQuota', () => {
    it('should send UpdateItemCommand to DynamoDB for video', async () => {
      mockSend.mockResolvedValue({});

      await deductQuota('user-1', 'video', 30);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.UpdateExpression).toContain('if_not_exists');
      expect(cmd.input.ExpressionAttributeValues[':amount'].N).toBe('30');
    });

    it('should send UpdateItemCommand for photo', async () => {
      mockSend.mockResolvedValue({});

      await deductQuota('user-1', 'photo', 1);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.ExpressionAttributeValues[':amount'].N).toBe('1');
    });

    it('should send UpdateItemCommand for peak', async () => {
      mockSend.mockResolvedValue({});

      await deductQuota('user-1', 'peak', 1);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should not throw on DynamoDB write failure', async () => {
      mockSend.mockRejectedValue(new Error('Write failed'));

      // Should not throw — logs the error internally
      await expect(deductQuota('user-1', 'video', 10)).resolves.toBeUndefined();
    });
  });

  describe('getQuotaUsage', () => {
    it('should aggregate all three counters', async () => {
      // Three parallel GetItemCommand calls
      mockSend
        .mockResolvedValueOnce({ Item: { count: { N: '30' } } })   // video-seconds
        .mockResolvedValueOnce({ Item: { count: { N: '5' } } })    // photo-count
        .mockResolvedValueOnce({ Item: { count: { N: '2' } } });   // peak-count

      const usage = await getQuotaUsage('user-1');

      expect(usage.videoSecondsUsed).toBe(30);
      expect(usage.photoCountUsed).toBe(5);
      expect(usage.peakCountUsed).toBe(2);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('should return zeros when no usage recorded', async () => {
      mockSend.mockResolvedValue({ Item: undefined });

      const usage = await getQuotaUsage('new-user');

      expect(usage.videoSecondsUsed).toBe(0);
      expect(usage.photoCountUsed).toBe(0);
      expect(usage.peakCountUsed).toBe(0);
    });
  });
});
