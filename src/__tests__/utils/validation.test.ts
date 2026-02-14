/**
 * Validation Utility Tests
 * Tests for input validation functions
 */

import {
  validate,
  sanitize,
  sanitizeObject,
  validatePassword,
  isPasswordValid,
  getPasswordStrength,
  getPasswordStrengthLevel,
  PASSWORD_RULES,
  isDisposableEmail,
  detectDomainTypo,
  isLegitimateProvider,
  validateForm,
  rules,
} from '../../utils/validation';
import { isValidUUID } from '../../utils/formatters';

describe('Validation Utils', () => {
  describe('validate.email', () => {
    it('should return true for valid emails', () => {
      expect(validate.email('test@example.com')).toBe(true);
      expect(validate.email('user.name@domain.co.uk')).toBe(true);
      expect(validate.email('user+tag@example.com')).toBe(true);
    });

    it('should return false for invalid emails', () => {
      expect(validate.email('')).toBe(false);
      expect(validate.email('invalid')).toBe(false);
      expect(validate.email('@example.com')).toBe(false);
      expect(validate.email('test@')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(validate.email(null as unknown as string)).toBe(false);
      expect(validate.email(undefined as unknown as string)).toBe(false);
    });
  });

  describe('validate.username', () => {
    it('should return true for valid usernames', () => {
      expect(validate.username('john_doe')).toBe(true);
      expect(validate.username('user123')).toBe(true);
    });

    it('should return false for invalid usernames', () => {
      expect(validate.username('')).toBe(false);
      expect(validate.username('user@name')).toBe(false);
      expect(validate.username('user name')).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    it('should return true for valid UUIDs', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should return false for invalid UUIDs', () => {
      expect(isValidUUID('')).toBe(false);
      expect(isValidUUID('not-a-uuid')).toBe(false);
      expect(isValidUUID(null)).toBe(false);
      expect(isValidUUID(undefined)).toBe(false);
    });
  });

  describe('validate.url', () => {
    it('should return true for valid URLs', () => {
      expect(validate.url('https://example.com')).toBe(true);
      expect(validate.url('http://example.com/path')).toBe(true);
    });

    it('should return false for invalid URLs', () => {
      expect(validate.url('')).toBe(false);
      expect(validate.url('not-a-url')).toBe(false);
      expect(validate.url('ftp://example.com')).toBe(false);
      // localhost may or may not be valid depending on regex implementation
    });
  });

  describe('sanitize', () => {
    it('should remove HTML tags and quotes', () => {
      // sanitize removes < > " ' characters
      expect(sanitize('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script');
    });

    it('should remove quotes', () => {
      expect(sanitize('"quoted"')).toBe('quoted');
      expect(sanitize("'single'")).toBe('single');
    });

    it('should trim whitespace', () => {
      expect(sanitize('  hello  ')).toBe('hello');
    });

    it('should handle null/undefined', () => {
      expect(sanitize(null)).toBe('');
      expect(sanitize(undefined)).toBe('');
    });
  });

  describe('validatePassword', () => {
    it('should return array of rule results', () => {
      const results = validatePassword('Test123!');
      expect(Array.isArray(results)).toBe(true);
      expect(results).toHaveLength(PASSWORD_RULES.length);
    });

    it('should mark rules as passed correctly', () => {
      const results = validatePassword('Short1!');
      const lengthResult = results.find((r) => r.id === 'length');
      const uppercaseResult = results.find((r) => r.id === 'uppercase');

      expect(lengthResult?.passed).toBe(false);
      expect(uppercaseResult?.passed).toBe(true);
    });
  });

  describe('isPasswordValid', () => {
    it('should return true for strong passwords', () => {
      expect(isPasswordValid('StrongPass123!')).toBe(true);
    });

    it('should return false for weak passwords', () => {
      expect(isPasswordValid('short')).toBe(false);
      expect(isPasswordValid('lowercase123!')).toBe(false);
    });
  });

  describe('getPasswordStrength', () => {
    it('should return 0 for empty password', () => {
      expect(getPasswordStrength('')).toBe(0);
    });

    it('should return higher score for stronger passwords', () => {
      const weak = getPasswordStrength('short');
      const strong = getPasswordStrength('Str0ng!P@ss');
      expect(weak).toBeLessThan(strong);
    });
  });

  describe('getPasswordStrengthLevel', () => {
    it('should return correct level object', () => {
      const level = getPasswordStrengthLevel('StrongPass123!');
      expect(level).toHaveProperty('level');
      expect(level).toHaveProperty('label');
      expect(level).toHaveProperty('color');
    });

    it('should return weak for short passwords', () => {
      const level = getPasswordStrengthLevel('short');
      expect(level.level).toBe('weak');
    });
  });

  describe('validate.phone', () => {
    it('should return true for valid phone numbers', () => {
      expect(validate.phone('+33 6 12 34 56 78')).toBe(true);
      expect(validate.phone('0612345678')).toBe(true);
      expect(validate.phone('+1 (555) 123-4567')).toBe(true);
    });

    it('should return false for invalid phone numbers', () => {
      expect(validate.phone('123')).toBe(false);
      expect(validate.phone('')).toBe(false);
      expect(validate.phone(null)).toBe(false);
      expect(validate.phone(undefined)).toBe(false);
    });
  });

  describe('validate.notEmpty', () => {
    it('should return true for non-empty strings', () => {
      expect(validate.notEmpty('hello')).toBe(true);
      expect(validate.notEmpty('  a  ')).toBe(true);
    });

    it('should return false for empty/whitespace/null', () => {
      expect(validate.notEmpty('')).toBe(false);
      expect(validate.notEmpty('   ')).toBe(false);
      expect(validate.notEmpty(null)).toBe(false);
      expect(validate.notEmpty(undefined)).toBe(false);
    });
  });

  describe('validate.minLength', () => {
    it('should return true when length >= min', () => {
      expect(validate.minLength('hello', 5)).toBe(true);
      expect(validate.minLength('hello', 3)).toBe(true);
    });

    it('should return false when length < min', () => {
      expect(validate.minLength('hi', 5)).toBe(false);
      expect(validate.minLength(null, 1)).toBe(false);
    });
  });

  describe('validate.maxLength', () => {
    it('should return true when length <= max', () => {
      expect(validate.maxLength('hi', 5)).toBe(true);
      expect(validate.maxLength('hello', 5)).toBe(true);
    });

    it('should return false when length > max', () => {
      expect(validate.maxLength('hello world', 5)).toBe(false);
    });

    it('should return true for null/undefined (length 0)', () => {
      expect(validate.maxLength(null, 5)).toBe(true);
    });
  });

  describe('validate.match', () => {
    it('should return true for matching values', () => {
      expect(validate.match('abc', 'abc')).toBe(true);
      expect(validate.match(123, 123)).toBe(true);
    });

    it('should return false for non-matching values', () => {
      expect(validate.match('abc', 'def')).toBe(false);
      expect(validate.match(1, '1')).toBe(false);
    });
  });

  describe('validate.numeric', () => {
    it('should return true for digit-only strings', () => {
      expect(validate.numeric('12345')).toBe(true);
      expect(validate.numeric('0')).toBe(true);
    });

    it('should return false for non-numeric strings', () => {
      expect(validate.numeric('12.5')).toBe(false);
      expect(validate.numeric('abc')).toBe(false);
      expect(validate.numeric('')).toBe(false);
      expect(validate.numeric(null)).toBe(false);
    });
  });

  describe('validate.alphanumeric', () => {
    it('should return true for alphanumeric strings', () => {
      expect(validate.alphanumeric('abc123')).toBe(true);
      expect(validate.alphanumeric('ABC')).toBe(true);
    });

    it('should return false for non-alphanumeric strings', () => {
      expect(validate.alphanumeric('abc_123')).toBe(false);
      expect(validate.alphanumeric('hello world')).toBe(false);
      expect(validate.alphanumeric('')).toBe(false);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize all string values in an object', () => {
      const result = sanitizeObject({ name: '<b>John</b>', age: 25 });
      expect(result.name).toBe('bJohn/b');
      expect(result.age).toBe(25);
    });

    it('should handle objects with no string values', () => {
      const result = sanitizeObject({ count: 10, active: true });
      expect(result.count).toBe(10);
      expect(result.active).toBe(true);
    });

    it('should handle empty object', () => {
      expect(sanitizeObject({})).toEqual({});
    });
  });

  describe('isDisposableEmail', () => {
    it('should return true for known disposable domains', () => {
      expect(isDisposableEmail('test@tempmail.com')).toBe(true);
      expect(isDisposableEmail('user@yopmail.com')).toBe(true);
      expect(isDisposableEmail('spam@mailinator.com')).toBe(true);
    });

    it('should return false for legitimate domains', () => {
      expect(isDisposableEmail('user@gmail.com')).toBe(false);
      expect(isDisposableEmail('user@outlook.com')).toBe(false);
    });

    it('should return false for null/undefined/no @', () => {
      expect(isDisposableEmail(null)).toBe(false);
      expect(isDisposableEmail(undefined)).toBe(false);
      expect(isDisposableEmail('noemail')).toBe(false);
    });
  });

  describe('detectDomainTypo', () => {
    it('should detect common Gmail typos', () => {
      const result = detectDomainTypo('user@gmial.com');
      expect(result.isTypo).toBe(true);
      expect(result.suggestion).toBe('gmail.com');
    });

    it('should detect common Hotmail typos', () => {
      const result = detectDomainTypo('user@hotmal.com');
      expect(result.isTypo).toBe(true);
      expect(result.suggestion).toBe('hotmail.com');
    });

    it('should return isTypo false for correct domains', () => {
      expect(detectDomainTypo('user@gmail.com').isTypo).toBe(false);
      expect(detectDomainTypo('user@outlook.com').isTypo).toBe(false);
    });

    it('should return isTypo false for null/undefined', () => {
      expect(detectDomainTypo(null).isTypo).toBe(false);
      expect(detectDomainTypo(undefined).isTypo).toBe(false);
    });

    it('should return isTypo false for email without domain', () => {
      expect(detectDomainTypo('nodomain').isTypo).toBe(false);
    });
  });

  describe('isLegitimateProvider', () => {
    it('should return true for known providers', () => {
      expect(isLegitimateProvider('user@gmail.com')).toBe(true);
      expect(isLegitimateProvider('user@outlook.com')).toBe(true);
      expect(isLegitimateProvider('user@orange.fr')).toBe(true);
    });

    it('should return false for unknown domains', () => {
      expect(isLegitimateProvider('user@randomdomain.xyz')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isLegitimateProvider(null)).toBe(false);
      expect(isLegitimateProvider(undefined)).toBe(false);
    });
  });

  describe('validateForm', () => {
    it('should return isValid true when all rules pass', () => {
      const result = validateForm({
        name: { value: 'John', rules: [rules.required] },
      });
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('should return errors for failing fields', () => {
      const result = validateForm({
        name: { value: '', rules: [rules.required] },
        email: { value: 'bad', rules: [rules.email] },
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBe('This field is required');
      expect(result.errors.email).toBe('Invalid email address');
    });

    it('should stop at first failing rule per field', () => {
      const result = validateForm({
        password: { value: '', rules: [rules.required, rules.password] },
      });
      expect(result.errors.password).toBe('This field is required');
    });
  });

  describe('rules factories', () => {
    it('rules.required should return error for empty', () => {
      expect(rules.required('')).toBe('This field is required');
      expect(rules.required('hello')).toBeNull();
    });

    it('rules.email should return error for invalid', () => {
      expect(rules.email('bad')).toBe('Invalid email address');
      expect(rules.email('user@example.com')).toBeNull();
    });

    it('rules.phone should return error for invalid', () => {
      expect(rules.phone('123')).toBe('Invalid phone number');
      expect(rules.phone('+33612345678')).toBeNull();
    });

    it('rules.username should return error for invalid', () => {
      expect(rules.username('a')).toBe('Username must be 3-20 characters (letters, numbers, _)');
      expect(rules.username('valid_user')).toBeNull();
    });

    it('rules.password should return error for weak', () => {
      expect(rules.password('short')).toBe('Password does not meet requirements');
      expect(rules.password('StrongPass1!')).toBeNull();
    });

    it('rules.minLength should return error when too short', () => {
      const rule = rules.minLength(5);
      expect(rule('hi')).toBe('Minimum 5 characters');
      expect(rule('hello')).toBeNull();
    });

    it('rules.maxLength should return error when too long', () => {
      const rule = rules.maxLength(3);
      expect(rule('hello')).toBe('Maximum 3 characters');
      expect(rule('hi')).toBeNull();
    });

    it('rules.match should return error when not matching', () => {
      const rule = rules.match('password', 'Password');
      expect(rule('different')).toBe('Must match Password');
      expect(rule('password')).toBeNull();
    });
  });
});
