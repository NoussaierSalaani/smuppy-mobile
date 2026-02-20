/**
 * Cleanup Deleted Accounts Handler Unit Tests
 * Scheduled job that hard-deletes accounts past the 30-day grace period.
 * Tests: no accounts, success flow, S3 cleanup, Cognito deletion,
 * Stripe cleanup, SNS cleanup, partial failures, and full error handling.
 */

// --- Set env vars BEFORE handler import (module-level constants capture these at load time) ---
process.env.MEDIA_BUCKET = 'test-media-bucket';
process.env.USER_POOL_ID = 'us-east-1_testpool';

// --- Mocks (MUST be before handler import) ---

const mockQuery = jest.fn();

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn().mockResolvedValue({ query: mockQuery }),
  getReaderPool: jest.fn().mockResolvedValue({ query: mockQuery }),
}));

const mockStripeCustomersDel = jest.fn();
jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    customers: { del: mockStripeCustomersDel },
  }),
}));

const mockS3Send = jest.fn();
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: mockS3Send })),
  ListObjectsV2Command: jest.fn().mockImplementation((params) => params),
  DeleteObjectsCommand: jest.fn().mockImplementation((params) => params),
}));

const mockCognitoSend = jest.fn();
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({ send: mockCognitoSend })),
  AdminDeleteUserCommand: jest.fn().mockImplementation((params) => params),
}));

const mockSnsSend = jest.fn();
jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn().mockImplementation(() => ({ send: mockSnsSend })),
  DeleteEndpointCommand: jest.fn().mockImplementation((params) => params),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

import { handler } from '../../profiles/cleanup-deleted';

// --- Test data ---

const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_COGNITO_SUB = 'cognito-sub-test123';
const TEST_STRIPE_CUSTOMER_ID = 'cus_test123';


// --- Tests ---

describe('Cleanup Deleted Accounts Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: S3 list returns empty
    mockS3Send.mockResolvedValue({ Contents: [] });
    mockCognitoSend.mockResolvedValue({});
    mockSnsSend.mockResolvedValue({});
    mockStripeCustomersDel.mockResolvedValue({});
  });

  describe('No accounts to delete', () => {
    it('should return deleted=0, errors=0 when no accounts past grace period', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // find accounts query

      const result = await handler();

      expect(result).toEqual({ deleted: 0, errors: 0 });
    });
  });

  describe('Successful cleanup', () => {
    it('should hard-delete account and return deleted=1', async () => {
      // Find accounts past grace period
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: TEST_PROFILE_ID,
          cognito_sub: TEST_COGNITO_SUB,
          stripe_customer_id: null,
        }],
      });
      // Anonymize payments
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });
      // SNS endpoints query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // Hard delete profile
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await handler();

      expect(result).toEqual({ deleted: 1, errors: 0 });
    });

    it('should anonymize payment records before deleting profile', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 2 }) // anonymize payments
        .mockResolvedValueOnce({ rows: [] }) // SNS endpoints
        .mockResolvedValueOnce({ rowCount: 1 }); // delete profile

      await handler();

      // Verify payment anonymization query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payments SET creator_id = NULL'),
        [TEST_PROFILE_ID]
      );
    });

    it('should delete Stripe customer when stripe_customer_id is present', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 }) // anonymize payments
        .mockResolvedValueOnce({ rows: [] }) // SNS endpoints
        .mockResolvedValueOnce({ rowCount: 1 }); // delete profile

      await handler();

      expect(mockStripeCustomersDel).toHaveBeenCalledWith(TEST_STRIPE_CUSTOMER_ID);
    });

    it('should NOT call Stripe when stripe_customer_id is null', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await handler();

      expect(mockStripeCustomersDel).not.toHaveBeenCalled();
    });

    it('should delete SNS endpoints for the user', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 }) // anonymize payments
        .mockResolvedValueOnce({ rows: [{ sns_endpoint_arn: 'arn:aws:sns:us-east-1:123:endpoint/test' }] }) // SNS endpoints
        .mockResolvedValueOnce({ rowCount: 1 }); // delete profile

      await handler();

      expect(mockSnsSend).toHaveBeenCalled();
    });

    it('should delete S3 media for all prefixes', async () => {
      mockS3Send.mockResolvedValue({
        Contents: [{ Key: `avatars/${TEST_PROFILE_ID}/photo.jpg` }],
      });

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 }) // anonymize payments
        .mockResolvedValueOnce({ rows: [] }) // SNS endpoints
        .mockResolvedValueOnce({ rowCount: 1 }); // delete profile

      await handler();

      // Should list objects for 4 prefixes (avatars, posts, peaks, media)
      expect(mockS3Send).toHaveBeenCalledTimes(8); // 4 list + 4 delete
    });

    it('should delete Cognito user when USER_POOL_ID and cognito_sub are set', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await handler();

      expect(mockCognitoSend).toHaveBeenCalled();
    });

    it('should hard-delete the profile from the database', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await handler();

      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM profiles WHERE id = $1',
        [TEST_PROFILE_ID]
      );
    });
  });

  describe('Multiple accounts', () => {
    it('should process multiple accounts and return correct counts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'profile-1', cognito_sub: 'sub-1', stripe_customer_id: null },
          { id: 'profile-2', cognito_sub: 'sub-2', stripe_customer_id: null },
        ],
      });
      // For each profile: anonymize payments, SNS endpoints, delete profile
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await handler();

      expect(result.deleted).toBe(2);
      expect(result.errors).toBe(0);
    });
  });

  describe('Partial failures', () => {
    it('should continue processing when Stripe deletion fails', async () => {
      mockStripeCustomersDel.mockRejectedValue(new Error('Stripe error'));

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: TEST_STRIPE_CUSTOMER_ID,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 }) // anonymize payments
        .mockResolvedValueOnce({ rows: [] }) // SNS endpoints
        .mockResolvedValueOnce({ rowCount: 1 }); // delete profile

      const result = await handler();

      // Should still succeed overall (Stripe error is caught)
      expect(result.deleted).toBe(1);
      expect(result.errors).toBe(0);
    });

    it('should continue processing when S3 cleanup fails', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 error'));

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await handler();

      expect(result.deleted).toBe(1);
    });

    it('should continue processing when Cognito deletion fails', async () => {
      mockCognitoSend.mockRejectedValue(new Error('Cognito error'));

      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await handler();

      expect(result.deleted).toBe(1);
    });

    it('should count as error when profile deletion itself fails', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: TEST_PROFILE_ID,
            cognito_sub: TEST_COGNITO_SUB,
            stripe_customer_id: null,
          }],
        })
        .mockResolvedValueOnce({ rowCount: 0 }) // anonymize payments
        .mockResolvedValueOnce({ rows: [] }) // SNS endpoints
        .mockRejectedValueOnce(new Error('FK constraint violation')); // delete profile fails

      const result = await handler();

      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(1);
    });
  });

  describe('Full error handling', () => {
    it('should return errors when the initial query fails', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await handler();

      expect(result.deleted).toBe(0);
      expect(result.errors).toBe(1);
    });
  });
});
