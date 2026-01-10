/**
 * Validation utilities for form inputs, passwords, and data sanitization.
 * @module utils/validation
 */

// ============================================
// SANITIZATION
// ============================================

/**
 * Sanitize a string by removing potentially dangerous characters.
 * Removes: < > " ' `
 * @param {string} v - The string to sanitize
 * @returns {string} Sanitized string
 */
export const sanitize = (v) => v?.replace(/[<>\"'`]/g, '').trim() || '';

/**
 * Sanitize all string values in an object.
 * @param {Object} obj - Object with string values to sanitize
 * @returns {Object} Object with sanitized string values
 */
export const sanitizeObject = (obj) => {
  const clean = {};
  Object.keys(obj).forEach(k => { clean[k] = typeof obj[k] === 'string' ? sanitize(obj[k]) : obj[k]; });
  return clean;
};

// ============================================
// GENERAL VALIDATORS
// ============================================

/**
 * Collection of validation functions for common input types.
 * Each function returns true if valid, false otherwise.
 * @example
 * validate.email('user@example.com') // true
 * validate.username('john_doe') // true
 */
export const validate = {
  /** Validate email format */
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v?.trim()),
  /** Validate phone number (10+ digits with optional formatting) */
  phone: (v) => /^[\d\s\-+()]{10,}$/.test(v?.trim()),
  /** Validate username (3-20 chars, alphanumeric + underscore) */
  username: (v) => /^[a-zA-Z0-9_]{3,20}$/.test(v),
  /** Check if value is not empty after trimming */
  notEmpty: (v) => v?.trim()?.length > 0,
  /** Check minimum length */
  minLength: (v, min) => v?.length >= min,
  /** Check maximum length */
  maxLength: (v, max) => v?.length <= max,
  /** Check if two values match */
  match: (v1, v2) => v1 === v2,
  /** Validate URL format */
  url: (v) => /^https?:\/\/.+\..+/.test(v?.trim()),
  /** Check if value contains only digits */
  numeric: (v) => /^\d+$/.test(v),
  /** Check if value is alphanumeric */
  alphanumeric: (v) => /^[a-zA-Z0-9]+$/.test(v),
};

// ============================================
// PASSWORD VALIDATION
// ============================================

/**
 * Password validation rules for security requirements.
 * Each rule has an id, label, and test function.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (pwd) => pwd?.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter (A-Z)', test: (pwd) => /[A-Z]/.test(pwd) },
  { id: 'lowercase', label: 'One lowercase letter (a-z)', test: (pwd) => /[a-z]/.test(pwd) },
  { id: 'number', label: 'One number (0-9)', test: (pwd) => /[0-9]/.test(pwd) },
  { id: 'special', label: 'One special character (!@#$%^&*)', test: (pwd) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd) },
];

/**
 * Validate password against all rules and return detailed results.
 * @param {string} password - Password to validate
 * @returns {Array<{id: string, label: string, passed: boolean}>} Array of rule results
 */
export const validatePassword = (password) => {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    passed: rule.test(password),
  }));
};

/**
 * Check if password meets all security requirements.
 * @param {string} password - Password to validate
 * @returns {boolean} True if all rules pass
 */
export const isPasswordValid = (password) => {
  return PASSWORD_RULES.every((rule) => rule.test(password));
};

/**
 * Calculate password strength score (0-100).
 * Considers: rule compliance, length bonus, character variety.
 * @param {string} password - Password to evaluate
 * @returns {number} Strength score 0-100
 */
export const getPasswordStrength = (password) => {
  if (!password) return 0;
  const passedRules = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const baseScore = (passedRules / PASSWORD_RULES.length) * 70;
  const lengthBonus = Math.min((password.length - 8) * 2, 20);
  const uniqueChars = new Set(password).size;
  const varietyBonus = Math.min((uniqueChars / password.length) * 10, 10);
  return Math.min(Math.round(baseScore + Math.max(0, lengthBonus) + varietyBonus), 100);
};

/**
 * Get password strength level with label and color for UI display.
 * @param {string} password - Password to evaluate
 * @returns {{level: string, label: string, color: string}} Strength info
 * @example
 * getPasswordStrengthLevel('Abc123!@') // { level: 'strong', label: 'Strong', color: '#34C759' }
 */
export const getPasswordStrengthLevel = (password) => {
  const strength = getPasswordStrength(password);
  if (strength < 30) return { level: 'weak', label: 'Weak', color: '#FF3B30' };
  if (strength < 50) return { level: 'medium', label: 'Medium', color: '#FF9500' };
  if (strength < 80) return { level: 'strong', label: 'Strong', color: '#34C759' };
  return { level: 'very-strong', label: 'Very Strong', color: '#11E3A3' };
};

// ============================================
// FORM VALIDATION HELPER
// ============================================

/**
 * Validate multiple form fields at once.
 * @param {Object} fields - Object with field configs { fieldName: { value, rules: [fn, fn] } }
 * @returns {{isValid: boolean, errors: Object}} Validation result
 * @example
 * const result = validateForm({
 *   email: { value: 'test@email.com', rules: [rules.required, rules.email] },
 *   password: { value: 'abc', rules: [rules.required, rules.password] }
 * });
 * // result.isValid = false, result.errors = { password: 'Password does not meet requirements' }
 */
export const validateForm = (fields) => {
  const errors = {};
  Object.keys(fields).forEach(key => {
    const { value, rules } = fields[key];
    for (const rule of rules) {
      const error = rule(value);
      if (error) { errors[key] = error; break; }
    }
  });
  return { isValid: Object.keys(errors).length === 0, errors };
};

// ============================================
// PRE-BUILT RULES FOR validateForm
// ============================================

/**
 * Pre-built validation rules that return error messages.
 * Use with validateForm() function.
 * @example
 * const emailRules = [rules.required, rules.email];
 * const passwordRules = [rules.required, rules.password];
 */
export const rules = {
  required: (v) => !validate.notEmpty(v) ? 'This field is required' : null,
  email: (v) => !validate.email(v) ? 'Invalid email address' : null,
  phone: (v) => !validate.phone(v) ? 'Invalid phone number' : null,
  username: (v) => !validate.username(v) ? 'Username must be 3-20 characters (letters, numbers, _)' : null,
  password: (v) => !isPasswordValid(v) ? 'Password does not meet requirements' : null,
  minLength: (min) => (v) => !validate.minLength(v, min) ? `Minimum ${min} characters` : null,
  maxLength: (max) => (v) => !validate.maxLength(v, max) ? `Maximum ${max} characters` : null,
  match: (compareValue, fieldName) => (v) => !validate.match(v, compareValue) ? `Must match ${fieldName}` : null,
};