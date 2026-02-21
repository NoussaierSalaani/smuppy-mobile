/**
 * Account Types Config Tests
 * Tests for account type constants and helper functions
 */

import { ACCOUNT_TYPE, isPro, isProCreator, isProBusiness } from '../../config/accountTypes';

describe('accountTypes', () => {
  // ==========================================================================
  // 1. ACCOUNT_TYPE Constants
  // ==========================================================================
  describe('ACCOUNT_TYPE constants', () => {
    it('should define PERSONAL as "personal"', () => {
      expect(ACCOUNT_TYPE.PERSONAL).toBe('personal');
    });

    it('should define PRO_CREATOR as "pro_creator"', () => {
      expect(ACCOUNT_TYPE.PRO_CREATOR).toBe('pro_creator');
    });

    it('should define PRO_BUSINESS as "pro_business"', () => {
      expect(ACCOUNT_TYPE.PRO_BUSINESS).toBe('pro_business');
    });

    it('should have exactly 3 account types', () => {
      expect(Object.keys(ACCOUNT_TYPE)).toHaveLength(3);
    });

    it('should have distinct values for each type', () => {
      const values = Object.values(ACCOUNT_TYPE);
      const uniqueValues = new Set(values);
      expect(uniqueValues.size).toBe(values.length);
    });
  });

  // ==========================================================================
  // 2. isPro Helper
  // ==========================================================================
  describe('isPro', () => {
    it('should return true for pro_creator', () => {
      expect(isPro(ACCOUNT_TYPE.PRO_CREATOR)).toBe(true);
    });

    it('should return true for pro_business', () => {
      expect(isPro(ACCOUNT_TYPE.PRO_BUSINESS)).toBe(true);
    });

    it('should return false for personal', () => {
      expect(isPro(ACCOUNT_TYPE.PERSONAL)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isPro(undefined)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isPro(null)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isPro('')).toBe(false);
    });

    it('should return false for arbitrary string', () => {
      expect(isPro('admin')).toBe(false);
    });
  });

  // ==========================================================================
  // 3. isProCreator Helper
  // ==========================================================================
  describe('isProCreator', () => {
    it('should return true for pro_creator', () => {
      expect(isProCreator(ACCOUNT_TYPE.PRO_CREATOR)).toBe(true);
    });

    it('should return false for pro_business', () => {
      expect(isProCreator(ACCOUNT_TYPE.PRO_BUSINESS)).toBe(false);
    });

    it('should return false for personal', () => {
      expect(isProCreator(ACCOUNT_TYPE.PERSONAL)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isProCreator(undefined)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isProCreator(null)).toBe(false);
    });
  });

  // ==========================================================================
  // 4. isProBusiness Helper
  // ==========================================================================
  describe('isProBusiness', () => {
    it('should return true for pro_business', () => {
      expect(isProBusiness(ACCOUNT_TYPE.PRO_BUSINESS)).toBe(true);
    });

    it('should return false for pro_creator', () => {
      expect(isProBusiness(ACCOUNT_TYPE.PRO_CREATOR)).toBe(false);
    });

    it('should return false for personal', () => {
      expect(isProBusiness(ACCOUNT_TYPE.PERSONAL)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isProBusiness(undefined)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isProBusiness(null)).toBe(false);
    });
  });
});
