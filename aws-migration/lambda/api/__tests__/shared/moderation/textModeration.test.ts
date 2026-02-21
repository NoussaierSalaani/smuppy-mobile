/**
 * Tests for shared/moderation/textModeration
 * Validates analyzeTextToxicity: thresholds, empty/short text, Comprehend responses,
 * overall Toxicity score, and filterText fallback on Comprehend failure.
 */

// ── Mocks (must be before handler import — Jest hoists jest.mock calls) ──

const mockComprehendSend = jest.fn();

jest.mock('@aws-sdk/client-comprehend', () => ({
  ComprehendClient: jest.fn().mockImplementation(() => ({ send: mockComprehendSend })),
  DetectToxicContentCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

jest.mock('../../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn(),
}));

// Logger is already mocked by global setup (__tests__/helpers/setup.ts),
// but add explicit mock since our test is nested deeper (shared/moderation/).
jest.mock('../../../../api/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    initFromEvent: jest.fn(),
    setRequestId: jest.fn(),
    setUserId: jest.fn(),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logQuery: jest.fn(),
    logSecurity: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
}));

// ── Import AFTER all mocks are declared ──

import { analyzeTextToxicity } from '../../../../shared/moderation/textModeration';
import { filterText } from '../../../../shared/moderation/textFilter';

// ── Tests ──

describe('analyzeTextToxicity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns pass for empty text', async () => {
    const result = await analyzeTextToxicity('');

    expect(result).toEqual({
      action: 'pass',
      maxScore: 0,
      topCategory: null,
      categories: [],
    });
    expect(mockComprehendSend).not.toHaveBeenCalled();
  });

  it('returns pass for text shorter than 3 chars', async () => {
    const result = await analyzeTextToxicity('hi');

    expect(result).toEqual({
      action: 'pass',
      maxScore: 0,
      topCategory: null,
      categories: [],
    });
    expect(mockComprehendSend).not.toHaveBeenCalled();
  });

  it('returns pass when Comprehend returns empty ResultList', async () => {
    mockComprehendSend.mockResolvedValueOnce({ ResultList: [] });

    const result = await analyzeTextToxicity('some normal text');

    expect(result).toEqual({
      action: 'pass',
      maxScore: 0,
      topCategory: null,
      categories: [],
    });
  });

  it('returns pass when labels are empty', async () => {
    mockComprehendSend.mockResolvedValueOnce({
      ResultList: [{ Labels: [], Toxicity: 0.1 }],
    });

    const result = await analyzeTextToxicity('another normal text');

    expect(result).toEqual({
      action: 'pass',
      maxScore: 0,
      topCategory: null,
      categories: [],
    });
  });

  it('returns pass when all scores below 0.7', async () => {
    mockComprehendSend.mockResolvedValueOnce({
      ResultList: [{
        Labels: [
          { Name: 'PROFANITY', Score: 0.3 },
          { Name: 'INSULT', Score: 0.5 },
        ],
        Toxicity: 0.4,
      }],
    });

    const result = await analyzeTextToxicity('mildly rude text');

    expect(result.action).toBe('pass');
    expect(result.maxScore).toBe(0.5);
    expect(result.topCategory).toBe('INSULT');
    expect(result.categories).toHaveLength(2);
  });

  it('returns flag when max score is between 0.7 and 0.9', async () => {
    mockComprehendSend.mockResolvedValueOnce({
      ResultList: [{
        Labels: [
          { Name: 'INSULT', Score: 0.85 },
          { Name: 'PROFANITY', Score: 0.4 },
        ],
        Toxicity: 0.6,
      }],
    });

    const result = await analyzeTextToxicity('somewhat toxic text');

    expect(result.action).toBe('flag');
    expect(result.maxScore).toBe(0.85);
    expect(result.topCategory).toBe('INSULT');
  });

  it('returns block when max score is above 0.9', async () => {
    mockComprehendSend.mockResolvedValueOnce({
      ResultList: [{
        Labels: [
          { Name: 'HATE_SPEECH', Score: 0.95 },
          { Name: 'PROFANITY', Score: 0.3 },
        ],
        Toxicity: 0.92,
      }],
    });

    const result = await analyzeTextToxicity('very toxic text');

    expect(result.action).toBe('block');
    expect(result.maxScore).toBe(0.95);
    expect(result.topCategory).toBe('HATE_SPEECH');
    expect(result.categories).toEqual([
      { name: 'HATE_SPEECH', score: 0.95 },
      { name: 'PROFANITY', score: 0.3 },
    ]);
  });

  it('uses overall Toxicity score when higher than label scores', async () => {
    mockComprehendSend.mockResolvedValueOnce({
      ResultList: [{
        Labels: [
          { Name: 'PROFANITY', Score: 0.6 },
          { Name: 'INSULT', Score: 0.5 },
        ],
        Toxicity: 0.95,
      }],
    });

    const result = await analyzeTextToxicity('text with high overall toxicity');

    // effectiveScore = Math.max(0.95, 0.6) = 0.95 → block
    expect(result.action).toBe('block');
    expect(result.maxScore).toBe(0.95);
    // topCategory is still the highest label (PROFANITY at 0.6)
    expect(result.topCategory).toBe('PROFANITY');
  });

  it('falls back to filterText on Comprehend failure and blocks when filterText finds critical', async () => {
    mockComprehendSend.mockRejectedValueOnce(new Error('Comprehend unavailable'));
    (filterText as jest.Mock).mockResolvedValueOnce({
      clean: false,
      violations: ['hate_speech'],
      severity: 'critical',
    });

    const result = await analyzeTextToxicity('some hateful text here');

    expect(result).toEqual({
      action: 'block',
      maxScore: 1.0,
      topCategory: 'HATE_SPEECH',
      categories: [],
    });
    expect(filterText).toHaveBeenCalledWith('some hateful text here');
  });

  it('returns pass when both Comprehend and filterText fail', async () => {
    mockComprehendSend.mockRejectedValueOnce(new Error('Comprehend unavailable'));
    (filterText as jest.Mock).mockRejectedValueOnce(new Error('filterText also failed'));

    const result = await analyzeTextToxicity('some text that cannot be analyzed');

    expect(result).toEqual({
      action: 'pass',
      maxScore: 0,
      topCategory: null,
      categories: [],
    });
    expect(filterText).toHaveBeenCalledWith('some text that cannot be analyzed');
  });
});
