/**
 * Content moderation filters for user-generated text.
 * Client-side first line of defense — backend is the source of truth.
 *
 * Detections:
 * - Profanity wordlist (FR/EN/AR) with leetspeak variants
 * - Excessive caps lock (>70% uppercase on 20+ chars)
 * - Character repetition spam (aaaaaa, !!!!!!)
 * - Phishing URL patterns
 * - Personal data leaks (phone numbers, emails in public content)
 *
 * @module utils/contentFilters
 */

// ============================================
// TYPES
// ============================================

export type ViolationCategory =
  | 'profanity'
  | 'hate_speech'
  | 'harassment'
  | 'spam'
  | 'caps_abuse'
  | 'personal_data'
  | 'phishing';

export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface FilterResult {
  /** True if the content passes all checks */
  clean: boolean;
  /** List of violation categories found */
  violations: ViolationCategory[];
  /** Highest severity among violations */
  severity: Severity;
  /** User-facing message explaining why content was blocked */
  reason: string | null;
}

// ============================================
// WORDLISTS
// ============================================

// Critical slurs and hate speech — always blocked regardless of context
const CRITICAL_WORDS: string[] = [
  // English hate speech / slurs
  'nigger', 'nigga', 'n1gger', 'n1gga', 'nigg3r', 'faggot', 'f4ggot', 'fag',
  'kike', 'k1ke', 'chink', 'ch1nk', 'wetback', 'spic', 'sp1c',
  'tranny', 'tr4nny', 'retard', 'r3tard',
  // French hate speech / slurs
  'nègre', 'negre', 'n3gre', 'bougnoul', 'bougnoule',
  'bicot', 'b1cot', 'bamboula', 'raton',
  'youpin', 'y0upin', 'feuj',
  'pédé', 'pede', 'p3d3', 'tapette', 'tap3tte', 'tarlouze',
  'enculé', 'encule', 'enc ule',
  // Arabic transliterated slurs
  'kaffir', 'k4ffir', 'sharmouta', 'sharmou6a',
];

// Profanity — high severity, blocked in public content
const PROFANITY_WORDS: string[] = [
  // English
  'fuck', 'f*ck', 'fck', 'fuk', 'fuq', 'phuck', 'fxck',
  'shit', 'sh1t', 'sh!t', 'sht',
  'bitch', 'b1tch', 'b!tch', 'bytch',
  'asshole', 'a$$hole', 'a-hole',
  'dick', 'd1ck', 'dickhead',
  'pussy', 'pu$$y', 'puss1',
  'cunt', 'c*nt', 'cvnt',
  'whore', 'wh0re', 'slut', 'sl*t',
  'bastard', 'b4stard',
  'cock', 'c0ck',
  'motherfucker', 'mf', 'stfu', 'gtfo',
  // French
  'putain', 'put1n', 'ptn', 'ptain',
  'merde', 'm3rde', 'mrd',
  'bordel', 'b0rdel',
  'connard', 'c0nnard', 'connasse',
  'salaud', 'salop', 'salope', 'sal0pe',
  'nique', 'n1que', 'ntm', 'niktamere', 'niquer',
  'fdp', 'fils de pute', 'fils de p',
  'pd', 'tg', 'ta gueule', 'ferme ta gueule',
  'batard', 'b4tard', 'btrd',
  'branleur', 'branleuse',
  'couille', 'couilles',
  'casse-couilles', 'casse couilles',
  // Arabic transliterated
  'kess', 'koss', 'zeb', 'zebi', 'z3bi',
  'kelb', 'k3lb', 'hmar', 'hm4r',
  'kahba', 'k4hba', 'zamel', 'z4mel',
];

// Harassment patterns
const HARASSMENT_PATTERNS: RegExp[] = [
  /\bkill\s*(your)?self\b/i,
  /\bkys\b/i,
  /\bgo\s+die\b/i,
  /\bi('ll|will)\s+(find|come\s+for|hunt)\s+you\b/i,
  /\b(tu\s+vas|je\s+vais)\s+(crever|mourir|te\s+tuer)\b/i,
  /\bsuicide[\s-]?toi\b/i,
  /\bva\s+(te\s+)?pendre\b/i,
  /\bva\s+mourir\b/i,
  /\bje\s+vais\s+te\s+(trouver|buter|defoncer)\b/i,
];

// Phishing URL patterns
const PHISHING_PATTERNS: RegExp[] = [
  /\b(bit\.ly|tinyurl|t\.co|goo\.gl|rb\.gy|is\.gd|v\.gd)\//i,
  /\b(free[\s-]?money|free[\s-]?followers|get[\s-]?rich)\b/i,
  /\b(click\s+here|claim\s+now|act\s+fast|limited\s+offer)\b/i,
  /\bwww\.[a-z0-9-]+\.(xyz|tk|ml|ga|cf|gq|buzz|top|icu)\b/i,
];

// Personal data patterns (for public content — not applied to DMs)
const PERSONAL_DATA_PATTERNS: RegExp[] = [
  // Phone numbers (international formats)
  /\b(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}\b/,
  // Email addresses
  /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/,
];

// ============================================
// DETECTION FUNCTIONS
// ============================================

/**
 * Build a regex that matches a word with optional leetspeak boundaries.
 * Uses word boundaries to avoid false positives (e.g. "class" matching "ass").
 */
function buildWordRegex(word: string): RegExp {
  // Escape regex special chars except * which we use as wildcard
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Replace * with .* for simple wildcards
  const pattern = escaped.replace(/\\\*/g, '.*');
  return new RegExp(`\\b${pattern}\\b`, 'i');
}

function checkWordlist(text: string, wordlist: string[]): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b');

  for (const word of wordlist) {
    const regex = buildWordRegex(word);
    if (regex.test(text) || regex.test(normalized)) {
      return true;
    }
  }
  return false;
}

function checkPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function checkCapsAbuse(text: string): boolean {
  if (text.length < 20) return false;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 10) return false;
  const upperCount = (letters.match(/[A-Z]/g) || []).length;
  return (upperCount / letters.length) > 0.7;
}

function checkCharRepetition(text: string): boolean {
  // 5+ same character in a row (aaaaaa, !!!!!!!)
  return /(.)\1{4,}/i.test(text);
}

// ============================================
// MAIN API
// ============================================

interface FilterOptions {
  /** Context where the content is being posted */
  context: 'post' | 'comment' | 'chat' | 'live_chat' | 'bio' | 'group' | 'event' | 'spot';
  /** Skip personal data check (for private messages) */
  skipPersonalDataCheck?: boolean;
}

/**
 * Filter user-generated text content for policy violations.
 *
 * @param text - The raw text to check
 * @param options - Context and configuration
 * @returns FilterResult with clean status, violations, and severity
 *
 * @example
 * ```typescript
 * const result = filterContent('Hello world!', { context: 'post' });
 * if (!result.clean) {
 *   showError('Content Policy', result.reason);
 * }
 * ```
 */
export function filterContent(text: string, options: FilterOptions): FilterResult {
  if (!text || text.trim().length === 0) {
    return { clean: true, violations: [], severity: 'none', reason: null };
  }

  const violations: ViolationCategory[] = [];

  // 1. Critical: hate speech / slurs — always blocked
  if (checkWordlist(text, CRITICAL_WORDS)) {
    violations.push('hate_speech');
  }

  // 2. Profanity — blocked in public content
  if (checkWordlist(text, PROFANITY_WORDS)) {
    violations.push('profanity');
  }

  // 3. Harassment / threats
  if (checkPatterns(text, HARASSMENT_PATTERNS)) {
    violations.push('harassment');
  }

  // 4. Spam patterns
  if (checkCapsAbuse(text) || checkCharRepetition(text)) {
    violations.push(checkCapsAbuse(text) ? 'caps_abuse' : 'spam');
  }

  // 5. Phishing URLs
  if (checkPatterns(text, PHISHING_PATTERNS)) {
    violations.push('phishing');
  }

  // 6. Personal data (only in public contexts)
  if (!options.skipPersonalDataCheck && checkPatterns(text, PERSONAL_DATA_PATTERNS)) {
    const isPublic = ['post', 'comment', 'live_chat', 'bio', 'group', 'event', 'spot'].includes(options.context);
    if (isPublic) {
      violations.push('personal_data');
    }
  }

  if (violations.length === 0) {
    return { clean: true, violations: [], severity: 'none', reason: null };
  }

  // Determine severity
  const severity = getSeverity(violations);
  const reason = getReasonMessage(violations);

  return { clean: false, violations, severity, reason };
}

/**
 * Quick check for spam-like content without full filtering.
 * Useful for rate-limiting duplicate messages in live chat.
 *
 * @param text - Current message
 * @param recentMessages - Last N messages from this user
 * @returns true if the message looks like spam
 */
export function isSpamMessage(text: string, recentMessages: string[]): boolean {
  if (recentMessages.length < 2) return false;

  const normalized = text.toLowerCase().trim();

  // Exact duplicate of last message
  if (recentMessages.some(msg => msg.toLowerCase().trim() === normalized)) {
    return true;
  }

  // Very similar to recent messages (>80% overlap)
  for (const recent of recentMessages.slice(-3)) {
    const recentNorm = recent.toLowerCase().trim();
    if (recentNorm.length > 0 && normalized.length > 0) {
      const shorter = Math.min(normalized.length, recentNorm.length);
      const longer = Math.max(normalized.length, recentNorm.length);
      if (shorter / longer > 0.8) {
        let matches = 0;
        for (let i = 0; i < shorter; i++) {
          if (normalized[i] === recentNorm[i]) matches++;
        }
        if (matches / shorter > 0.8) return true;
      }
    }
  }

  return false;
}

// ============================================
// HELPERS
// ============================================

function getSeverity(violations: ViolationCategory[]): Severity {
  if (violations.includes('hate_speech') || violations.includes('harassment')) {
    return 'critical';
  }
  if (violations.includes('profanity') || violations.includes('phishing')) {
    return 'high';
  }
  if (violations.includes('spam') || violations.includes('caps_abuse')) {
    return 'medium';
  }
  if (violations.includes('personal_data')) {
    return 'low';
  }
  return 'low';
}

function getReasonMessage(violations: ViolationCategory[]): string {
  if (violations.includes('hate_speech')) {
    return 'Your message contains hate speech or slurs. This violates our community guidelines.';
  }
  if (violations.includes('harassment')) {
    return 'Your message contains threats or harassment. This violates our community guidelines.';
  }
  if (violations.includes('profanity')) {
    return 'Your message contains inappropriate language. Please keep it respectful.';
  }
  if (violations.includes('phishing')) {
    return 'Your message contains suspicious links. External links are not allowed.';
  }
  if (violations.includes('personal_data')) {
    return 'Your message appears to contain personal information (phone/email). Avoid sharing personal data publicly.';
  }
  if (violations.includes('caps_abuse')) {
    return 'Please avoid excessive use of capital letters.';
  }
  if (violations.includes('spam')) {
    return 'Your message looks like spam. Please avoid character repetition.';
  }
  return 'Your message violates our community guidelines.';
}
