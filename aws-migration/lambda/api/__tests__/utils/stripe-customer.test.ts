/**
 * Tests for utils/stripe-customer — getOrCreateStripeCustomer()
 *
 * Validates:
 * - Returns existing ID when passed via existingCustomerId
 * - Looks up existing customer in DB
 * - Creates new Stripe customer + saves to DB when none exists
 * - Uses provided Stripe instance over getStripeClient()
 * - Falls back to username when fullName is empty
 * - Propagates safeStripeCall errors
 */

// ── Mocks ──

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
  getReaderPool: jest.fn(),
}));

const mockStripeCreate = jest.fn();
jest.mock('../../../shared/stripe-client', () => ({
  getStripeClient: jest.fn().mockResolvedValue({
    customers: { create: mockStripeCreate },
  }),
}));

const mockSafeStripeCall = jest.fn();
jest.mock('../../../shared/stripe-resilience', () => ({
  safeStripeCall: mockSafeStripeCall,
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    logRequest: jest.fn(), logResponse: jest.fn(), logQuery: jest.fn(),
    logSecurity: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/constants', () => ({
  PLATFORM_NAME: 'smuppy',
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 50,
  RATE_WINDOW_1_MIN: 60,
}));

import { getOrCreateStripeCustomer } from '../../utils/stripe-customer';
import { createLogger } from '../../utils/logger';

// ── Helpers ──

const TEST_PROFILE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const EXISTING_CUSTOMER_ID = 'cus_existing123';
const NEW_CUSTOMER_ID = 'cus_new456';

function createMockDb() {
  return { query: jest.fn().mockResolvedValue({ rows: [] }) };
}

function createMockStripe() {
  return {
    customers: { create: jest.fn().mockResolvedValue({ id: NEW_CUSTOMER_ID }) },
  };
}

// ── Tests ──

describe('getOrCreateStripeCustomer', () => {
  const log = createLogger() as ReturnType<typeof createLogger>;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();

    // Default: safeStripeCall executes the function and returns result
    mockSafeStripeCall.mockImplementation(async (fn: () => Promise<unknown>) => fn());
  });

  // ── 1. Short-circuit with existingCustomerId ──

  it('should return existingCustomerId immediately without DB query', async () => {
    const result = await getOrCreateStripeCustomer({
      db: mockDb as never,
      profileId: TEST_PROFILE_ID,
      email: 'user@example.com',
      fullName: 'Test User',
      log,
      existingCustomerId: EXISTING_CUSTOMER_ID,
    });

    expect(result).toBe(EXISTING_CUSTOMER_ID);
    expect(mockDb.query).not.toHaveBeenCalled();
  });

  // ── 2. Fetch from DB when customer exists ──

  it('should return customer ID from DB when profile has one', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ stripe_customer_id: EXISTING_CUSTOMER_ID }],
    });

    const result = await getOrCreateStripeCustomer({
      db: mockDb as never,
      profileId: TEST_PROFILE_ID,
      email: 'user@example.com',
      fullName: 'Test User',
      log,
    });

    expect(result).toBe(EXISTING_CUSTOMER_ID);
    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(mockDb.query).toHaveBeenCalledWith(
      'SELECT stripe_customer_id FROM profiles WHERE id = $1',
      [TEST_PROFILE_ID]
    );
    expect(mockSafeStripeCall).not.toHaveBeenCalled();
  });

  // ── 3. Create new customer when none exists ──

  it('should create a new Stripe customer and save to DB', async () => {
    // DB lookup returns no customer
    mockDb.query.mockResolvedValueOnce({ rows: [{ stripe_customer_id: null }] });
    // DB update succeeds
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const mockStripe = createMockStripe();

    const result = await getOrCreateStripeCustomer({
      db: mockDb as never,
      stripe: mockStripe as never,
      profileId: TEST_PROFILE_ID,
      email: 'user@example.com',
      fullName: 'Test User',
      log,
    });

    expect(result).toBe(NEW_CUSTOMER_ID);

    // Verify safeStripeCall was invoked
    expect(mockSafeStripeCall).toHaveBeenCalledWith(
      expect.any(Function),
      'customers.create',
      log
    );

    // Verify DB update
    expect(mockDb.query).toHaveBeenCalledTimes(2);
    expect(mockDb.query).toHaveBeenLastCalledWith(
      'UPDATE profiles SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
      [NEW_CUSTOMER_ID, TEST_PROFILE_ID]
    );
  });

  // ── 4. Uses getStripeClient() when no Stripe instance provided ──

  it('should use getStripeClient() when stripe param is omitted', async () => {
    const { getStripeClient } = require('../../../shared/stripe-client');
    mockStripeCreate.mockResolvedValueOnce({ id: NEW_CUSTOMER_ID });

    // DB lookup returns empty
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const result = await getOrCreateStripeCustomer({
      db: mockDb as never,
      profileId: TEST_PROFILE_ID,
      email: 'user@example.com',
      fullName: 'Test User',
      log,
    });

    expect(result).toBe(NEW_CUSTOMER_ID);
    expect(getStripeClient).toHaveBeenCalled();
  });

  // ── 5. Falls back to username when fullName is empty ──

  it('should use username as name fallback when fullName is empty', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const mockStripe = createMockStripe();

    await getOrCreateStripeCustomer({
      db: mockDb as never,
      stripe: mockStripe as never,
      profileId: TEST_PROFILE_ID,
      email: null,
      fullName: null,
      username: 'testuser',
      log,
    });

    // safeStripeCall wraps the create call — verify via the stripe mock
    expect(mockStripe.customers.create).toHaveBeenCalledWith({
      email: undefined,
      name: 'testuser',
      metadata: { userId: TEST_PROFILE_ID, platform: 'smuppy' },
    });
  });

  // ── 6. Propagates safeStripeCall errors ──

  it('should propagate errors from safeStripeCall', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    mockSafeStripeCall.mockRejectedValueOnce(new Error('Stripe timeout'));

    await expect(
      getOrCreateStripeCustomer({
        db: mockDb as never,
        profileId: TEST_PROFILE_ID,
        email: 'user@example.com',
        fullName: 'Test User',
        log,
      })
    ).rejects.toThrow('Stripe timeout');
  });

  // ── 7. Handles null stripe_customer_id in DB ──

  it('should create customer when DB returns null stripe_customer_id', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ stripe_customer_id: null }],
    });
    mockDb.query.mockResolvedValueOnce({ rows: [] });

    const mockStripe = createMockStripe();

    const result = await getOrCreateStripeCustomer({
      db: mockDb as never,
      stripe: mockStripe as never,
      profileId: TEST_PROFILE_ID,
      email: 'user@example.com',
      fullName: 'Test User',
      log,
    });

    expect(result).toBe(NEW_CUSTOMER_ID);
    expect(mockSafeStripeCall).toHaveBeenCalled();
  });

  // ── 8. Skips existingCustomerId when null/undefined ──

  it('should not short-circuit when existingCustomerId is null', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{ stripe_customer_id: EXISTING_CUSTOMER_ID }],
    });

    const result = await getOrCreateStripeCustomer({
      db: mockDb as never,
      profileId: TEST_PROFILE_ID,
      email: 'user@example.com',
      fullName: 'Test User',
      log,
      existingCustomerId: null,
    });

    expect(result).toBe(EXISTING_CUSTOMER_ID);
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });
});
