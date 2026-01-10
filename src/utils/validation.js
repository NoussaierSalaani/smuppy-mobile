// ============================================
// SANITIZATION
// ============================================
export const sanitize = (v) => v?.replace(/[<>\"'`]/g, '').trim() || '';

export const sanitizeObject = (obj) => {
  const clean = {};
  Object.keys(obj).forEach(k => { clean[k] = typeof obj[k] === 'string' ? sanitize(obj[k]) : obj[k]; });
  return clean;
};

// ============================================
// GENERAL VALIDATORS
// ============================================
export const validate = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v?.trim()),
  phone: (v) => /^[\d\s\-+()]{10,}$/.test(v?.trim()),
  username: (v) => /^[a-zA-Z0-9_]{3,20}$/.test(v),
  notEmpty: (v) => v?.trim()?.length > 0,
  minLength: (v, min) => v?.length >= min,
  maxLength: (v, max) => v?.length <= max,
  match: (v1, v2) => v1 === v2,
  url: (v) => /^https?:\/\/.+\..+/.test(v?.trim()),
  numeric: (v) => /^\d+$/.test(v),
  alphanumeric: (v) => /^[a-zA-Z0-9]+$/.test(v),
};

// ============================================
// PASSWORD VALIDATION
// ============================================
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (pwd) => pwd?.length >= 8 },
  { id: 'uppercase', label: 'One uppercase letter (A-Z)', test: (pwd) => /[A-Z]/.test(pwd) },
  { id: 'lowercase', label: 'One lowercase letter (a-z)', test: (pwd) => /[a-z]/.test(pwd) },
  { id: 'number', label: 'One number (0-9)', test: (pwd) => /[0-9]/.test(pwd) },
  { id: 'special', label: 'One special character (!@#$%^&*)', test: (pwd) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pwd) },
];

export const validatePassword = (password) => {
  return PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    passed: rule.test(password),
  }));
};

export const isPasswordValid = (password) => {
  return PASSWORD_RULES.every((rule) => rule.test(password));
};

export const getPasswordStrength = (password) => {
  if (!password) return 0;
  const passedRules = PASSWORD_RULES.filter((rule) => rule.test(password)).length;
  const baseScore = (passedRules / PASSWORD_RULES.length) * 70;
  const lengthBonus = Math.min((password.length - 8) * 2, 20);
  const uniqueChars = new Set(password).size;
  const varietyBonus = Math.min((uniqueChars / password.length) * 10, 10);
  return Math.min(Math.round(baseScore + Math.max(0, lengthBonus) + varietyBonus), 100);
};

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