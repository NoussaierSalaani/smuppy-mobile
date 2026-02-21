const mockSend = jest.fn();

jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  GetSecretValueCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

// Must set env BEFORE importing module
process.env.STRIPE_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789:secret:stripe-key';
process.env.ADMIN_KEY_SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:123456789:secret:admin-key';

import {
  getStripeKey,
  getStripeWebhookSecret,
  getStripePublishableKey,
  invalidateStripeSecrets,
  getAdminKey,
} from '../../../shared/secrets';

describe('secrets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Invalidate caches between tests
    invalidateStripeSecrets();
  });

  describe('getStripeKey', () => {
    it('fetches and returns STRIPE_SECRET_KEY', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          STRIPE_SECRET_KEY: 'sk_test_123',
          STRIPE_PUBLISHABLE_KEY: 'pk_test_456',
          STRIPE_WEBHOOK_SECRET: 'whsec_789',
        }),
      });
      const key = await getStripeKey();
      expect(key).toBe('sk_test_123');
    });

    it('uses cache on second call', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          STRIPE_SECRET_KEY: 'sk_cached',
          STRIPE_PUBLISHABLE_KEY: 'pk_cached',
          STRIPE_WEBHOOK_SECRET: 'whsec_cached',
        }),
      });
      await getStripeKey();
      const key2 = await getStripeKey();
      expect(key2).toBe('sk_cached');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('throws when SecretString is empty', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: '' });
      await expect(getStripeKey()).rejects.toThrow('Secret value is empty');
    });

    it('throws when SecretString is undefined', async () => {
      mockSend.mockResolvedValueOnce({});
      await expect(getStripeKey()).rejects.toThrow('Secret value is empty');
    });
  });

  describe('getStripeWebhookSecret', () => {
    it('returns STRIPE_WEBHOOK_SECRET', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          STRIPE_SECRET_KEY: 'sk_x',
          STRIPE_PUBLISHABLE_KEY: 'pk_x',
          STRIPE_WEBHOOK_SECRET: 'whsec_test',
        }),
      });
      const secret = await getStripeWebhookSecret();
      expect(secret).toBe('whsec_test');
    });
  });

  describe('getStripePublishableKey', () => {
    it('returns STRIPE_PUBLISHABLE_KEY', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          STRIPE_SECRET_KEY: 'sk_x',
          STRIPE_PUBLISHABLE_KEY: 'pk_pub_test',
          STRIPE_WEBHOOK_SECRET: 'whsec_x',
        }),
      });
      const key = await getStripePublishableKey();
      expect(key).toBe('pk_pub_test');
    });
  });

  describe('invalidateStripeSecrets', () => {
    it('forces re-fetch on next call', async () => {
      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          STRIPE_SECRET_KEY: 'sk_old',
          STRIPE_PUBLISHABLE_KEY: 'pk_old',
          STRIPE_WEBHOOK_SECRET: 'whsec_old',
        }),
      });
      await getStripeKey();
      expect(mockSend).toHaveBeenCalledTimes(1);

      invalidateStripeSecrets();

      mockSend.mockResolvedValueOnce({
        SecretString: JSON.stringify({
          STRIPE_SECRET_KEY: 'sk_new',
          STRIPE_PUBLISHABLE_KEY: 'pk_new',
          STRIPE_WEBHOOK_SECRET: 'whsec_new',
        }),
      });
      const newKey = await getStripeKey();
      expect(newKey).toBe('sk_new');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAdminKey', () => {
    it('fetches admin key from Secrets Manager', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: 'admin-secret-123' });
      const key = await getAdminKey();
      expect(key).toBe('admin-secret-123');
    });

    it('throws when ADMIN_KEY_SECRET_ARN is not set', async () => {
      const originalArn = process.env.ADMIN_KEY_SECRET_ARN;
      delete process.env.ADMIN_KEY_SECRET_ARN;
      await expect(getAdminKey()).rejects.toThrow('ADMIN_KEY_SECRET_ARN environment variable is not set');
      process.env.ADMIN_KEY_SECRET_ARN = originalArn;
    });
  });
});
