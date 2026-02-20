/**
 * Content Filters Tests
 * Tests for client-side content moderation filters (profanity, hate speech,
 * harassment, spam, phishing, personal data, caps abuse).
 *
 * Source: src/utils/contentFilters.ts
 */

import {
  filterContent,
  isSpamMessage,
} from '../../utils/contentFilters';

// ---------------------------------------------------------------------------
// Helper — default options for most tests
// ---------------------------------------------------------------------------
const postOpts = { context: 'post' as const };

describe('Content Filters', () => {
  // =========================================================================
  // 1. filterContent — Clean content
  // =========================================================================
  describe('filterContent — Clean content', () => {
    it('should return clean for empty string', () => {
      const result = filterContent('', postOpts);
      expect(result.clean).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.severity).toBe('none');
      expect(result.reason).toBeNull();
    });

    it('should return clean for normal English text', () => {
      const result = filterContent(
        'This is a perfectly normal message about the weather today.',
        postOpts,
      );
      expect(result.clean).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('should return clean for normal French text', () => {
      const result = filterContent(
        'Bonjour, tout va bien merci. Il fait beau dehors.',
        postOpts,
      );
      expect(result.clean).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('should return clean for single word "hello"', () => {
      const result = filterContent('hello', postOpts);
      expect(result.clean).toBe(true);
    });

    it('should return clean for whitespace-only string', () => {
      const result = filterContent('     \t\n   ', postOpts);
      expect(result.clean).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.severity).toBe('none');
      expect(result.reason).toBeNull();
    });
  });

  // =========================================================================
  // 2. filterContent — Hate speech detection
  // =========================================================================
  describe('filterContent — Hate speech detection', () => {
    it('should detect English slur with critical severity', () => {
      const result = filterContent('you are a nigger', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
      expect(result.severity).toBe('critical');
    });

    it('should detect French slur', () => {
      const result = filterContent('sale bougnoul', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
    });

    it('should detect leetspeak variant (n1gger)', () => {
      const result = filterContent('you are a n1gger', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
      expect(result.severity).toBe('critical');
    });

    it('should detect slur with Unicode zero-width char obfuscation', () => {
      // Insert zero-width spaces between letters: n\u200Bi\u200Bg\u200Bg\u200Be\u200Br
      const obfuscated = 'n\u200Bi\u200Bg\u200Bg\u200Be\u200Br';
      const result = filterContent(obfuscated, postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
    });

    it('should detect Cyrillic homoglyph bypass attempt', () => {
      // Use Cyrillic а (U+0430) for 'a' and Cyrillic о (U+043E) for 'o' in "faggot"
      // f\u0430gg\u043Et
      const homoglyphed = 'f\u0430gg\u043Et';
      const result = filterContent(homoglyphed, postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
    });

    it('should detect slur embedded in a sentence', () => {
      const result = filterContent(
        'I think people like you are just faggot losers',
        postOpts,
      );
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
    });

    it('should NOT flag innocent word that looks similar (e.g., "bigger")', () => {
      const result = filterContent(
        'We need a bigger table for the party.',
        postOpts,
      );
      expect(result.clean).toBe(true);
      expect(result.violations).not.toContain('hate_speech');
    });

    it('should detect slurs case-insensitively', () => {
      const result = filterContent('NIGGER', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
      expect(result.severity).toBe('critical');
    });
  });

  // =========================================================================
  // 3. filterContent — Profanity detection
  // =========================================================================
  describe('filterContent — Profanity detection', () => {
    it('should detect English profanity with high severity', () => {
      const result = filterContent('what the fuck', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('profanity');
      expect(result.severity).toBe('high');
    });

    it('should detect French profanity (putain, merde)', () => {
      const resultPutain = filterContent('oh putain', postOpts);
      expect(resultPutain.clean).toBe(false);
      expect(resultPutain.violations).toContain('profanity');

      const resultMerde = filterContent('quelle merde', postOpts);
      expect(resultMerde.clean).toBe(false);
      expect(resultMerde.violations).toContain('profanity');
    });

    it('should detect leetspeak variant (f*ck, sh1t)', () => {
      const resultFck = filterContent('f*ck this', postOpts);
      expect(resultFck.clean).toBe(false);
      expect(resultFck.violations).toContain('profanity');

      const resultSht = filterContent('oh sh1t', postOpts);
      expect(resultSht.clean).toBe(false);
      expect(resultSht.violations).toContain('profanity');
    });

    it('should detect number substitution (b1tch)', () => {
      const result = filterContent('you b1tch', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('profanity');
    });

    it('should detect profanity embedded in longer text', () => {
      const result = filterContent(
        'I was walking down the street and this asshole cut me off in traffic.',
        postOpts,
      );
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('profanity');
    });

    it('should detect abbreviations (stfu, gtfo)', () => {
      const resultStfu = filterContent('just stfu already', postOpts);
      expect(resultStfu.clean).toBe(false);
      expect(resultStfu.violations).toContain('profanity');

      const resultGtfo = filterContent('gtfo of here', postOpts);
      expect(resultGtfo.clean).toBe(false);
      expect(resultGtfo.violations).toContain('profanity');
    });
  });

  // =========================================================================
  // 4. filterContent — Harassment detection
  // =========================================================================
  describe('filterContent — Harassment detection', () => {
    it('should detect "kill yourself" with critical severity', () => {
      const result = filterContent('just kill yourself', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('harassment');
      expect(result.severity).toBe('critical');
    });

    it('should detect "kys" abbreviation', () => {
      const result = filterContent('kys lol', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('harassment');
    });

    it('should detect French harassment ("va te pendre")', () => {
      const result = filterContent('va te pendre', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('harassment');
    });

    it('should detect death threats ("i\'ll find you")', () => {
      const result = filterContent("i'll find you", postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('harassment');
    });

    it('should detect French death threats ("je vais te trouver")', () => {
      const result = filterContent('je vais te trouver', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('harassment');
    });
  });

  // =========================================================================
  // 5. filterContent — Caps abuse detection
  // =========================================================================
  describe('filterContent — Caps abuse detection', () => {
    it('should detect ALL CAPS text over 20 chars', () => {
      const result = filterContent(
        'THIS IS AN EXTREMELY LOUD MESSAGE FOR EVERYONE',
        postOpts,
      );
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('caps_abuse');
      expect(result.severity).toBe('medium');
    });

    it('should return clean for short caps text (<20 chars)', () => {
      const result = filterContent('HELLO WORLD', postOpts);
      // Under 20 chars total — caps abuse should not trigger
      expect(result.violations).not.toContain('caps_abuse');
    });

    it('should return clean for mixed case with less than 70% uppercase', () => {
      // Mix of upper and lower — keep uppercase below 70%
      const result = filterContent(
        'This Is A Normal Sentence With Some Uppercase Letters Here Today',
        postOpts,
      );
      expect(result.violations).not.toContain('caps_abuse');
    });

    it('should return clean when letters count < 10 even with numbers', () => {
      const result = filterContent('12345678901234567890AB', postOpts);
      // Only 2 letters (A and B) — below the 10-letter threshold
      expect(result.violations).not.toContain('caps_abuse');
    });
  });

  // =========================================================================
  // 6. filterContent — Character repetition / spam
  // =========================================================================
  describe('filterContent — Character repetition / spam', () => {
    it('should detect repeated characters (aaaaaaa) as spam', () => {
      const result = filterContent('aaaaaaa', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('spam');
    });

    it('should detect repeated punctuation (!!!!!!!!!) as spam', () => {
      const result = filterContent('!!!!!!!!!', postOpts);
      expect(result.clean).toBe(false);
      // Punctuation is not letters so caps_abuse won't fire; spam should
      expect(result.violations).toContain('spam');
      expect(result.violations).not.toContain('caps_abuse');
    });

    it('should return clean for only 4 repeated characters (below threshold)', () => {
      const result = filterContent('aaaa', postOpts);
      // 5+ needed to trigger — 4 is fine
      expect(result.violations).not.toContain('spam');
    });
  });

  // =========================================================================
  // 7. filterContent — Phishing detection
  // =========================================================================
  describe('filterContent — Phishing detection', () => {
    it('should detect shortened URL (bit.ly)', () => {
      const result = filterContent('check bit.ly/scam', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('phishing');
    });

    it('should detect suspicious .xyz domain', () => {
      const result = filterContent(
        'visit www.freeprize.xyz for details',
        postOpts,
      );
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('phishing');
    });

    it('should detect "free money" spam phrase', () => {
      const result = filterContent(
        'Get free money by signing up here',
        postOpts,
      );
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('phishing');
    });

    it('should detect "click here claim now"', () => {
      const result = filterContent('click here to claim now!', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('phishing');
    });
  });

  // =========================================================================
  // 8. filterContent — Personal data detection
  // =========================================================================
  describe('filterContent — Personal data detection', () => {
    it('should detect phone number in public post', () => {
      const result = filterContent(
        'Call me at +33 6 12 34 56 78',
        postOpts,
      );
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('personal_data');
      expect(result.severity).toBe('low');
    });

    it('should detect email address in public post', () => {
      const result = filterContent(
        'My email is john.doe@gmail.com',
        postOpts,
      );
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('personal_data');
    });

    it('should skip phone number check when skipPersonalDataCheck is true', () => {
      const result = filterContent('Call me at +33 6 12 34 56 78', {
        context: 'chat',
        skipPersonalDataCheck: true,
      });
      expect(result.violations).not.toContain('personal_data');
    });

    it('should skip personal data in DM (context chat) with skipPersonalDataCheck: true', () => {
      const result = filterContent('john@example.com', {
        context: 'chat',
        skipPersonalDataCheck: true,
      });
      expect(result.violations).not.toContain('personal_data');
    });

    it('should apply personal data check to all public contexts', () => {
      const publicContexts: Array<
        'post' | 'comment' | 'live_chat' | 'bio' | 'group' | 'event' | 'spot'
      > = ['post', 'comment', 'live_chat', 'bio', 'group', 'event', 'spot'];

      for (const ctx of publicContexts) {
        const result = filterContent('reach me at user@test.com', {
          context: ctx,
        });
        expect(result.violations).toContain('personal_data');
      }
    });
  });

  // =========================================================================
  // 9. filterContent — Multiple violations
  // =========================================================================
  describe('filterContent — Multiple violations', () => {
    it('should report both profanity AND caps abuse when both present', () => {
      // Text with standalone profanity words + all caps over 20 chars + enough letters
      const result = filterContent(
        'WHAT THE FUCK IS GOING ON HERE SERIOUSLY THIS IS SHIT',
        postOpts,
      );
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('profanity');
      expect(result.violations).toContain('caps_abuse');
    });

    it('should set severity to the highest among violations', () => {
      // hate_speech (critical) + profanity (high) — severity should be critical
      const result = filterContent('nigger fuck you', postOpts);
      expect(result.clean).toBe(false);
      expect(result.violations).toContain('hate_speech');
      expect(result.violations).toContain('profanity');
      expect(result.severity).toBe('critical');
    });

    it('should set reason to the highest-priority violation message', () => {
      // hate_speech is the highest priority — its reason should appear
      const result = filterContent('nigger fuck you', postOpts);
      expect(result.reason).toBe(
        'Your message contains hate speech or slurs. This violates our community guidelines.',
      );
    });
  });

  // =========================================================================
  // 10. filterContent — Reason messages
  // =========================================================================
  describe('filterContent — Reason messages', () => {
    it('should return hate_speech reason message', () => {
      const result = filterContent('nigger', postOpts);
      expect(result.reason).toBe(
        'Your message contains hate speech or slurs. This violates our community guidelines.',
      );
    });

    it('should return harassment reason message', () => {
      const result = filterContent('kill yourself now', postOpts);
      expect(result.reason).toBe(
        'Your message contains threats or harassment. This violates our community guidelines.',
      );
    });

    it('should return profanity reason message', () => {
      const result = filterContent('what the fuck', postOpts);
      expect(result.reason).toBe(
        'Your message contains inappropriate language. Please keep it respectful.',
      );
    });

    it('should return phishing reason message', () => {
      const result = filterContent('check bit.ly/free', postOpts);
      expect(result.reason).toBe(
        'Your message contains suspicious links. External links are not allowed.',
      );
    });

    it('should return personal_data reason message', () => {
      const result = filterContent('email me at test@foo.com', postOpts);
      expect(result.reason).toBe(
        'Your message appears to contain personal information (phone/email). Avoid sharing personal data publicly.',
      );
    });

    it('should return caps_abuse reason message', () => {
      const result = filterContent(
        'THIS IS EXTREMELY LOUD AND OBNOXIOUS TEXT RIGHT HERE',
        postOpts,
      );
      expect(result.reason).toBe(
        'Please avoid excessive use of capital letters.',
      );
    });

    it('should return spam reason message for character repetition', () => {
      const result = filterContent('aaaaaaa', postOpts);
      expect(result.reason).toBe(
        'Your message looks like spam. Please avoid character repetition.',
      );
    });
  });

  // =========================================================================
  // 11. isSpamMessage
  // =========================================================================
  describe('isSpamMessage', () => {
    it('should return true for exact duplicate of recent message', () => {
      const recent = ['hello there', 'how are you', 'hello there'];
      expect(isSpamMessage('hello there', recent)).toBe(true);
    });

    it('should return true for different-case duplicate', () => {
      const recent = ['Hello There', 'how are you', 'something else'];
      expect(isSpamMessage('hello there', recent)).toBe(true);
    });

    it('should return false for non-duplicate message', () => {
      const recent = ['message one', 'message two', 'message three'];
      expect(isSpamMessage('completely different', recent)).toBe(false);
    });

    it('should return false when less than 2 recent messages (early return)', () => {
      expect(isSpamMessage('hello', ['hello'])).toBe(false);
      expect(isSpamMessage('hello', [])).toBe(false);
    });

    it('should return true for very similar message (>80% character overlap)', () => {
      // "hello world!" and "hello world?" are very similar
      const recent = ['first msg', 'second msg', 'hello world!'];
      expect(isSpamMessage('hello world?', recent)).toBe(true);
    });

    it('should return false for different message with same length', () => {
      const recent = ['abcdefghij', 'klmnopqrst', 'uvwxyz1234'];
      // Same length as 'uvwxyz1234' but completely different characters
      expect(isSpamMessage('1234567890', recent)).toBe(false);
    });

    it('should handle empty strings gracefully', () => {
      // Empty text with non-empty recent — early trim makes it length 0
      const recent = ['one', 'two', 'three'];
      // normalized.length === 0, so similarity loop body won't execute
      expect(isSpamMessage('', recent)).toBe(false);
    });

    it('should only check last 3 messages for similarity', () => {
      // The duplicate is at index 0 (outside the last 3 slice)
      // But .some() for exact duplicate checks ALL recent messages,
      // so an exact duplicate is still caught regardless of position.
      // For the similarity check though, only last 3 are used.
      const recent = [
        'unique message alpha',
        'something else beta',
        'another thing gamma',
        'totally different delta',
      ];
      // Not an exact match for any, and last 3 are all different enough
      expect(isSpamMessage('unique message alpha', recent)).toBe(true);
      // ^ exact duplicate match still works via .some() on full array
    });
  });
});
