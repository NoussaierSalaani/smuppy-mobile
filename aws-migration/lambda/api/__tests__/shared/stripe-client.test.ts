jest.mock('../../../shared/secrets', () => ({
  getStripeKey: jest.fn().mockResolvedValue('sk_test_mock_key'),
}));

jest.mock('stripe', () => {
  return jest.fn().mockImplementation((key: string) => ({
    _key: key,
    customers: {},
    subscriptions: {},
  }));
});

describe('stripe-client', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('creates Stripe instance with key from secrets on first call', async () => {
    const { getStripeClient } = require('../../../shared/stripe-client');
    const stripe = await getStripeClient();
    expect(stripe).toBeDefined();
    expect(stripe._key).toBe('sk_test_mock_key');
  });

  it('returns the same instance on subsequent calls (singleton)', async () => {
    const { getStripeClient } = require('../../../shared/stripe-client');
    const stripe1 = await getStripeClient();
    const stripe2 = await getStripeClient();
    expect(stripe1).toBe(stripe2);
  });

  it('creates a new instance after module reset', async () => {
    const mod1 = require('../../../shared/stripe-client');
    const stripe1 = await mod1.getStripeClient();

    jest.resetModules();
    // Re-mock after reset
    jest.mock('../../../shared/secrets', () => ({
      getStripeKey: jest.fn().mockResolvedValue('sk_test_new_key'),
    }));
    jest.mock('stripe', () => jest.fn().mockImplementation((key: string) => ({ _key: key })));

    const mod2 = require('../../../shared/stripe-client');
    const stripe2 = await mod2.getStripeClient();
    expect(stripe2._key).toBe('sk_test_new_key');
    expect(stripe1).not.toBe(stripe2);
  });

  it('propagates error when getStripeKey fails', async () => {
    jest.resetModules();
    jest.mock('../../../shared/secrets', () => ({
      getStripeKey: jest.fn().mockRejectedValue(new Error('Secret not found')),
    }));
    const { getStripeClient } = require('../../../shared/stripe-client');
    await expect(getStripeClient()).rejects.toThrow('Secret not found');
  });
});
