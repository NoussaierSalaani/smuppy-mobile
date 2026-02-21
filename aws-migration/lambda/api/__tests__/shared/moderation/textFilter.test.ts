/**
 * Tests for shared/moderation/textFilter
 *
 * Validates text filtering: empty/clean input, hate speech detection (with
 * evasion techniques), profanity detection, harassment pattern detection,
 * and severity mapping.
 *
 * Since MODERATION_WORDLIST_BUCKET is not set, the module uses fallback
 * wordlists (no S3 calls).
 */

// ── Mocks (before handler import — Jest hoists jest.mock calls) ──

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  GetObjectCommand: jest.fn(),
}));

import { filterText } from '../../../../shared/moderation/textFilter';

// ============================================================
// EMPTY / CLEAN INPUT
// ============================================================

describe('textFilter — filterText()', () => {
  describe('empty and clean input', () => {
    it('returns clean for empty string', async () => {
      const result = await filterText('');
      expect(result).toEqual({ clean: true, violations: [], severity: 'none' });
    });

    it('returns clean for whitespace-only string', async () => {
      const result = await filterText('   \t\n  ');
      expect(result).toEqual({ clean: true, violations: [], severity: 'none' });
    });

    it('returns clean for normal text', async () => {
      const result = await filterText('Hello, how are you today?');
      expect(result).toEqual({ clean: true, violations: [], severity: 'none' });
    });

    it('returns clean for null/undefined (falsy input)', async () => {
      // The function checks `!text`, so null/undefined both return clean
      const resultNull = await filterText(null as unknown as string);
      expect(resultNull).toEqual({ clean: true, violations: [], severity: 'none' });

      const resultUndefined = await filterText(undefined as unknown as string);
      expect(resultUndefined).toEqual({ clean: true, violations: [], severity: 'none' });
    });
  });

  // ============================================================
  // HATE SPEECH DETECTION (critical severity)
  // ============================================================

  describe('hate speech detection', () => {
    it('detects plain hate speech slur', async () => {
      const result = await filterText('you are a faggot');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
    });

    it('detects hate speech with zero-width characters', async () => {
      // Zero-width space (\u200B) inserted to evade detection
      const result = await filterText('nig\u200Bger');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
    });

    it('detects hate speech with accented chars via NFD normalization', async () => {
      // Combining diaeresis (\u0308) on 'i' to create evasion: "nïgger"
      const result = await filterText('ni\u0308gger');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
    });

    it('detects hate speech with Cyrillic homoglyphs', async () => {
      // Replace Latin 'a' with Cyrillic 'а' (\u0430) in "faggot"
      const result = await filterText('f\u0430ggot');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
    });

    it('detects hate speech with leet-speak', async () => {
      // f4gg0t → faggot after leet normalization (4→a, 0→o)
      const result = await filterText('f4gg0t');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
    });
  });

  // ============================================================
  // PROFANITY DETECTION (high severity)
  // ============================================================

  describe('profanity detection', () => {
    it('detects plain profanity', async () => {
      const result = await filterText('this is shit');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('profanity');
    });

    it('detects profanity with mixed case', async () => {
      const result = await filterText('what the FUCK');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('profanity');
    });

    it('detects French profanity', async () => {
      const result = await filterText('oh putain');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('profanity');
    });
  });

  // ============================================================
  // HARASSMENT DETECTION (critical severity)
  // ============================================================

  describe('harassment detection', () => {
    it('detects "kill yourself" pattern', async () => {
      const result = await filterText('just kill yourself');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('harassment');
    });

    it('detects "kys" abbreviation', async () => {
      const result = await filterText('lol kys');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('harassment');
    });

    it('detects French threat pattern "je vais te tuer"', async () => {
      const result = await filterText('je vais te tuer');
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('harassment');
    });
  });

  // ============================================================
  // SEVERITY MAPPING
  // ============================================================

  describe('severity mapping', () => {
    it('maps hate_speech to critical severity', async () => {
      const result = await filterText('you are a nigger');
      expect(result.severity).toBe('critical');
      expect(result.violations).toContain('hate_speech');
    });

    it('maps profanity-only to high severity', async () => {
      const result = await filterText('this is shit');
      // Profanity without hate_speech or harassment → high
      expect(result.severity).toBe('high');
      expect(result.violations).toContain('profanity');
      expect(result.violations).not.toContain('hate_speech');
      expect(result.violations).not.toContain('harassment');
    });

    it('maps harassment to critical severity', async () => {
      // "go die" triggers harassment but not hate_speech or profanity
      const result = await filterText('go die loser');
      expect(result.severity).toBe('critical');
      expect(result.violations).toContain('harassment');
    });
  });
});
