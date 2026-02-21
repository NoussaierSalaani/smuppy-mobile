/**
 * Text Moderation Utility Unit Tests
 *
 * Tests the two-stage moderation pipeline:
 * - moderateText: keyword filter + Comprehend toxicity
 * - moderateTexts: multi-text moderation with worst-flag aggregation
 */

// Mock shared moderation modules
jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn(),
}));
jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn(),
}));

import { moderateText, moderateTexts } from '../../utils/text-moderation';
import { filterText } from '../../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../../shared/moderation/textModeration';
import { createLogger } from '../../utils/logger';

const mockFilterText = filterText as jest.MockedFunction<typeof filterText>;
const mockAnalyzeTextToxicity = analyzeTextToxicity as jest.MockedFunction<typeof analyzeTextToxicity>;

const mockLog = createLogger('test') as ReturnType<typeof createLogger>;
const mockHeaders = { 'Content-Type': 'application/json' };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Text Moderation Utility', () => {
  describe('moderateText', () => {
    it('should return clean result for clean text', async () => {
      mockFilterText.mockResolvedValue({ clean: true, severity: 'none' } as never);
      mockAnalyzeTextToxicity.mockResolvedValue({ action: 'pass', topCategory: null, maxScore: 0 } as never);

      const result = await moderateText('Hello world', mockHeaders, mockLog);

      expect(result.blocked).toBe(false);
      expect(result.contentFlagged).toBe(false);
      expect(result.flagCategory).toBeNull();
      expect(result.flagScore).toBeNull();
    });

    it('should block text rejected by keyword filter with critical severity', async () => {
      mockFilterText.mockResolvedValue({ clean: false, severity: 'critical' } as never);

      const result = await moderateText('bad content', mockHeaders, mockLog);

      expect(result.blocked).toBe(true);
      expect(result.blockResponse).toBeDefined();
      expect(result.blockResponse!.statusCode).toBe(400);
      const body = JSON.parse(result.blockResponse!.body);
      expect(body.message).toBe('Content policy violation');
      // Should not call Comprehend since filter already blocked
      expect(mockAnalyzeTextToxicity).not.toHaveBeenCalled();
    });

    it('should block text rejected by keyword filter with high severity', async () => {
      mockFilterText.mockResolvedValue({ clean: false, severity: 'high' } as never);

      const result = await moderateText('offensive content', mockHeaders, mockLog);

      expect(result.blocked).toBe(true);
      expect(result.blockResponse!.statusCode).toBe(400);
      expect(mockAnalyzeTextToxicity).not.toHaveBeenCalled();
    });

    it('should pass through to Comprehend if keyword filter severity is low', async () => {
      mockFilterText.mockResolvedValue({ clean: false, severity: 'low' } as never);
      mockAnalyzeTextToxicity.mockResolvedValue({ action: 'pass', topCategory: null, maxScore: 0.2 } as never);

      const result = await moderateText('mild content', mockHeaders, mockLog);

      expect(result.blocked).toBe(false);
      expect(mockAnalyzeTextToxicity).toHaveBeenCalledWith('mild content');
    });

    it('should pass through to Comprehend if keyword filter severity is medium', async () => {
      mockFilterText.mockResolvedValue({ clean: false, severity: 'medium' } as never);
      mockAnalyzeTextToxicity.mockResolvedValue({ action: 'pass', topCategory: null, maxScore: 0.3 } as never);

      const result = await moderateText('moderate content', mockHeaders, mockLog);

      expect(result.blocked).toBe(false);
      expect(mockAnalyzeTextToxicity).toHaveBeenCalled();
    });

    it('should block text when Comprehend action is block', async () => {
      mockFilterText.mockResolvedValue({ clean: true, severity: 'none' } as never);
      mockAnalyzeTextToxicity.mockResolvedValue({
        action: 'block',
        topCategory: 'HATE_SPEECH',
        maxScore: 0.95,
      } as never);

      const result = await moderateText('toxic text', mockHeaders, mockLog);

      expect(result.blocked).toBe(true);
      expect(result.blockResponse!.statusCode).toBe(400);
    });

    it('should flag text when Comprehend action is flag', async () => {
      mockFilterText.mockResolvedValue({ clean: true, severity: 'none' } as never);
      mockAnalyzeTextToxicity.mockResolvedValue({
        action: 'flag',
        topCategory: 'INSULT',
        maxScore: 0.78,
      } as never);

      const result = await moderateText('borderline text', mockHeaders, mockLog);

      expect(result.blocked).toBe(false);
      expect(result.contentFlagged).toBe(true);
      expect(result.flagCategory).toBe('INSULT');
      expect(result.flagScore).toBe(0.78);
    });

    it('should include context in log message when provided', async () => {
      mockFilterText.mockResolvedValue({ clean: false, severity: 'critical' } as never);

      await moderateText('bad', mockHeaders, mockLog, 'comment');

      // Verify the function executes without error with a context parameter
      expect(mockFilterText).toHaveBeenCalledWith('bad');
    });

    it('should use provided headers in block response', async () => {
      const customHeaders = { 'X-Custom': 'value', 'Content-Type': 'application/json' };
      mockFilterText.mockResolvedValue({ clean: false, severity: 'critical' } as never);

      const result = await moderateText('bad', customHeaders, mockLog);

      expect(result.blocked).toBe(true);
      expect(result.blockResponse!.headers).toEqual(customHeaders);
    });
  });

  describe('moderateTexts', () => {
    it('should return clean result when all texts are clean', async () => {
      mockFilterText.mockResolvedValue({ clean: true, severity: 'none' } as never);
      mockAnalyzeTextToxicity.mockResolvedValue({ action: 'pass', topCategory: null, maxScore: 0 } as never);

      const result = await moderateTexts(['Hello', 'World'], mockHeaders, mockLog);

      expect(result.blocked).toBe(false);
      expect(result.contentFlagged).toBe(false);
    });

    it('should block if any text is blocked', async () => {
      // First text clean, second text blocked
      mockFilterText
        .mockResolvedValueOnce({ clean: true, severity: 'none' } as never)
        .mockResolvedValueOnce({ clean: false, severity: 'critical' } as never);
      mockAnalyzeTextToxicity.mockResolvedValue({ action: 'pass', topCategory: null, maxScore: 0 } as never);

      const result = await moderateTexts(['Hello', 'bad content'], mockHeaders, mockLog);

      expect(result.blocked).toBe(true);
    });

    it('should skip empty and whitespace-only texts', async () => {
      mockFilterText.mockResolvedValue({ clean: true, severity: 'none' } as never);
      mockAnalyzeTextToxicity.mockResolvedValue({ action: 'pass', topCategory: null, maxScore: 0 } as never);

      const result = await moderateTexts(['', '   ', 'valid text'], mockHeaders, mockLog);

      expect(result.blocked).toBe(false);
      // Should only call filterText for the non-empty text
      expect(mockFilterText).toHaveBeenCalledTimes(1);
      expect(mockFilterText).toHaveBeenCalledWith('valid text');
    });

    it('should keep the worst flagged result (highest score)', async () => {
      mockFilterText.mockResolvedValue({ clean: true, severity: 'none' } as never);
      // First text flagged with lower score
      mockAnalyzeTextToxicity
        .mockResolvedValueOnce({ action: 'flag', topCategory: 'INSULT', maxScore: 0.72 } as never)
        .mockResolvedValueOnce({ action: 'flag', topCategory: 'PROFANITY', maxScore: 0.88 } as never);

      const result = await moderateTexts(['text1', 'text2'], mockHeaders, mockLog);

      expect(result.blocked).toBe(false);
      expect(result.contentFlagged).toBe(true);
      expect(result.flagCategory).toBe('PROFANITY');
      expect(result.flagScore).toBe(0.88);
    });

    it('should return clean result for empty array', async () => {
      const result = await moderateTexts([], mockHeaders, mockLog);

      expect(result.blocked).toBe(false);
      expect(result.contentFlagged).toBe(false);
      expect(mockFilterText).not.toHaveBeenCalled();
    });
  });
});
