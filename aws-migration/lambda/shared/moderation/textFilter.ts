/**
 * Backend text moderation filter.
 * Server-side source of truth for content filtering.
 *
 * - Loads wordlist from S3 (cached for 5 minutes)
 * - Falls back to embedded critical wordlist if S3 unavailable
 * - Checks profanity, hate speech, harassment patterns
 * - Returns violation result with severity
 *
 * @module shared/moderation/textFilter
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createLogger } from '../../api/utils/logger';

const log = createLogger('text-filter');

// ============================================
// TYPES
// ============================================

export type ViolationCategory =
  | 'profanity'
  | 'hate_speech'
  | 'harassment'
  | 'spam'
  | 'phishing';

export type Severity = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface TextFilterResult {
  clean: boolean;
  violations: ViolationCategory[];
  severity: Severity;
}

// ============================================
// S3 WORDLIST CACHE
// ============================================

interface WordlistCache {
  critical: string[];
  profanity: string[];
  harassment: RegExp[];
  lastLoaded: number;
}

let wordlistCache: WordlistCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-west-3',
});

// Fallback critical words (always available even if S3 fails)
const FALLBACK_CRITICAL: string[] = [
  'nigger', 'nigga', 'faggot', 'kike', 'chink', 'wetback', 'spic',
  'tranny', 'retard', 'negre', 'bougnoul', 'bougnoule', 'bicot',
  'bamboula', 'youpin', 'pede', 'tapette', 'tarlouze',
  'kaffir', 'sharmouta',
];

const FALLBACK_PROFANITY: string[] = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'whore', 'slut',
  'putain', 'merde', 'connard', 'connasse', 'salope', 'nique',
  'ntm', 'fdp', 'kahba', 'zamel',
];

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

async function loadWordlist(): Promise<WordlistCache> {
  // Return cached if still fresh
  if (wordlistCache && Date.now() - wordlistCache.lastLoaded < CACHE_TTL_MS) {
    return wordlistCache;
  }

  const bucket = process.env.MODERATION_WORDLIST_BUCKET;
  const key = process.env.MODERATION_WORDLIST_KEY || 'moderation/wordlist.json';

  if (!bucket) {
    // No S3 bucket configured — use fallback
    wordlistCache = {
      critical: FALLBACK_CRITICAL,
      profanity: FALLBACK_PROFANITY,
      harassment: HARASSMENT_PATTERNS,
      lastLoaded: Date.now(),
    };
    return wordlistCache;
  }

  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const body = await response.Body?.transformToString();
    if (!body) throw new Error('Empty S3 response');

    const data = JSON.parse(body) as {
      critical?: string[];
      profanity?: string[];
    };

    wordlistCache = {
      critical: data.critical || FALLBACK_CRITICAL,
      profanity: data.profanity || FALLBACK_PROFANITY,
      harassment: HARASSMENT_PATTERNS,
      lastLoaded: Date.now(),
    };
    return wordlistCache;
  } catch (err) {
    log.error('Failed to load wordlist from S3, using fallback', err);
    wordlistCache = {
      critical: FALLBACK_CRITICAL,
      profanity: FALLBACK_PROFANITY,
      harassment: HARASSMENT_PATTERNS,
      lastLoaded: Date.now(),
    };
    return wordlistCache;
  }
}

// ============================================
// DETECTION
// ============================================

function normalizeText(text: string): string {
  // 1. Remove zero-width characters used to evade detection
  let normalized = text.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF\u00AD]/g, '');

  // 2. Unicode NFD normalization: decompose accented chars and strip combining marks
  // e.g., "nig\u0308er" → "niger", "fa\u0301ggot" → "faggot"
  normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 3. Cyrillic homoglyph replacement (visually identical to Latin)
  const cyrillicMap: Record<string, string> = {
    '\u0410': 'a', '\u0430': 'a', // А/а → a
    '\u0412': 'b', '\u0432': 'b', // В/в → b
    '\u0421': 'c', '\u0441': 'c', // С/с → c
    '\u0415': 'e', '\u0435': 'e', // Е/е → e
    '\u041D': 'h', '\u043D': 'h', // Н/н → h
    '\u041A': 'k', '\u043A': 'k', // К/к → k
    '\u041C': 'm', '\u043C': 'm', // М/м → m
    '\u041E': 'o', '\u043E': 'o', // О/о → o
    '\u0420': 'p', '\u0440': 'p', // Р/р → p
    '\u0422': 't', '\u0442': 't', // Т/т → t
    '\u0425': 'x', '\u0445': 'x', // Х/х → x
    '\u0423': 'y', '\u0443': 'y', // У/у → y
  };
  normalized = normalized.replace(/[\u0410\u0430\u0412\u0432\u0421\u0441\u0415\u0435\u041D\u043D\u041A\u043A\u041C\u043C\u041E\u043E\u0420\u0440\u0422\u0442\u0425\u0445\u0423\u0443]/g,
    (ch) => cyrillicMap[ch] || ch);

  // 4. Leet-speak normalization
  return normalized
    .toLowerCase()
    .replace(/[@]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b')
    .replace(/[9]/g, 'g')
    .replace(/[6]/g, 'g')
    .replace(/[2]/g, 'z')
    .replace(/\+/g, 't');
}

function checkWordlist(text: string, wordlist: string[]): boolean {
  const normalized = normalizeText(text);
  const lower = text.toLowerCase();

  for (const word of wordlist) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(lower) || regex.test(normalized)) {
      return true;
    }
  }
  return false;
}

function checkPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

// ============================================
// MAIN API
// ============================================

/**
 * Filter text content for policy violations (server-side).
 *
 * @param text - Raw text to check
 * @returns TextFilterResult with clean status and severity
 */
export async function filterText(text: string): Promise<TextFilterResult> {
  if (!text || text.trim().length === 0) {
    return { clean: true, violations: [], severity: 'none' };
  }

  const wordlist = await loadWordlist();
  const violations: ViolationCategory[] = [];

  // 1. Critical: hate speech / slurs
  if (checkWordlist(text, wordlist.critical)) {
    violations.push('hate_speech');
  }

  // 2. Profanity
  if (checkWordlist(text, wordlist.profanity)) {
    violations.push('profanity');
  }

  // 3. Harassment / threats
  if (checkPatterns(text, wordlist.harassment)) {
    violations.push('harassment');
  }

  if (violations.length === 0) {
    return { clean: true, violations: [], severity: 'none' };
  }

  const severity = getSeverity(violations);
  return { clean: false, violations, severity };
}

function getSeverity(violations: ViolationCategory[]): Severity {
  if (violations.includes('hate_speech') || violations.includes('harassment')) {
    return 'critical';
  }
  if (violations.includes('profanity') || violations.includes('phishing')) {
    return 'high';
  }
  if (violations.includes('spam')) {
    return 'medium';
  }
  return 'low';
}
