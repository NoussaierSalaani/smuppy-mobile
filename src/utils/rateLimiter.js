const attempts = {};
const blocks = {};

export const rateLimiter = {
  check: (key, maxAttempts = 5, windowMs = 60000) => {
    const now = Date.now();
    if (blocks[key] && now < blocks[key]) return { allowed: false, blocked: true, retryIn: Math.ceil((blocks[key] - now) / 1000) };
    if (!attempts[key]) attempts[key] = [];
    attempts[key] = attempts[key].filter(t => now - t < windowMs);
    return { allowed: attempts[key].length < maxAttempts, blocked: false, remaining: maxAttempts - attempts[key].length };
  },
  record: (key) => {
    if (!attempts[key]) attempts[key] = [];
    attempts[key].push(Date.now());
  },
  block: (key, durationMs = 900000) => {
    blocks[key] = Date.now() + durationMs;
  },
  reset: (key) => {
    delete attempts[key];
    delete blocks[key];
  },
  clear: () => {
    Object.keys(attempts).forEach(k => delete attempts[k]);
    Object.keys(blocks).forEach(k => delete blocks[k]);
  },
};

export const RATE_LIMITS = {
  LOGIN: { key: 'login', max: 5, window: 60000, blockDuration: 900000 },
  SIGNUP: { key: 'signup', max: 3, window: 60000, blockDuration: 300000 },
  FORGOT_PASSWORD: { key: 'forgot', max: 3, window: 300000, blockDuration: 600000 },
  RESEND_CODE: { key: 'resend', max: 3, window: 60000, blockDuration: 300000 },
};