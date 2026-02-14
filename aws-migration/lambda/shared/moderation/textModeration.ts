/**
 * AWS Comprehend text toxicity detection.
 * Analyzes text content using DetectToxicContent API.
 *
 * Thresholds:
 * - > 0.9 toxicity → reject (block publication)
 * - 0.7–0.9 → flag as under_review (publish but tag)
 * - < 0.7 → pass
 *
 * Categories: HATE_SPEECH, INSULT, THREAT, SEXUAL, PROFANITY, GRAPHIC
 *
 * Cost: ~$0.0001 per 100-char unit (~$20/month for 200K analyses)
 *
 * @module shared/moderation/textModeration
 */

import { ComprehendClient, DetectToxicContentCommand } from '@aws-sdk/client-comprehend';
import { createLogger } from '../../api/utils/logger';
import { filterText } from './textFilter';

const log = createLogger('text-moderation');

const comprehendClient = new ComprehendClient({
  region: process.env.AWS_REGION || 'eu-west-1',
});

const BLOCK_THRESHOLD = 0.9;
const FLAG_THRESHOLD = 0.7;

export type ToxicityCategory =
  | 'HATE_SPEECH'
  | 'INSULT'
  | 'THREAT'
  | 'SEXUAL'
  | 'PROFANITY'
  | 'GRAPHIC';

export type ModerationAction = 'pass' | 'flag' | 'block';

export interface TextModerationResult {
  action: ModerationAction;
  maxScore: number;
  topCategory: ToxicityCategory | null;
  categories: Array<{ name: ToxicityCategory; score: number }>;
}

/**
 * Analyze text for toxicity using AWS Comprehend.
 * Non-blocking: returns 'pass' on errors to avoid blocking user content
 * when the service is unavailable.
 */
export async function analyzeTextToxicity(text: string): Promise<TextModerationResult> {
  const passResult: TextModerationResult = {
    action: 'pass',
    maxScore: 0,
    topCategory: null,
    categories: [],
  };

  // Skip empty or very short text (Comprehend minimum is 1 char)
  if (!text || text.trim().length < 3) {
    return passResult;
  }

  // Comprehend DetectToxicContent accepts up to 10 segments of 1000 chars each
  // Truncate to first 1000 chars for single-segment analysis
  const truncated = text.slice(0, 1000);

  try {
    const response = await comprehendClient.send(
      new DetectToxicContentCommand({
        TextSegments: [{ Text: truncated }],
        LanguageCode: 'en', // Works for EN/FR — Comprehend handles multilingual
      }),
    );

    const resultList = response.ResultList;
    if (!resultList || resultList.length === 0) {
      return passResult;
    }

    const segment = resultList[0];
    const labels = segment.Labels || [];

    if (labels.length === 0) {
      return passResult;
    }

    // Build category scores
    const categories = labels
      .filter(l => l.Name && l.Score !== undefined)
      .map(l => ({
        name: l.Name as ToxicityCategory,
        score: l.Score!,
      }));

    // Find highest toxicity score
    const maxLabel = categories.reduce(
      (max, c) => (c.score > max.score ? c : max),
      { name: 'PROFANITY' as ToxicityCategory, score: 0 },
    );

    // Also check the overall toxicity score
    const overallToxicity = segment.Toxicity ?? maxLabel.score;
    const effectiveScore = Math.max(overallToxicity, maxLabel.score);

    let action: ModerationAction = 'pass';
    if (effectiveScore > BLOCK_THRESHOLD) {
      action = 'block';
    } else if (effectiveScore > FLAG_THRESHOLD) {
      action = 'flag';
    }

    if (action !== 'pass') {
      log.info('Toxicity detected', {
        action,
        maxScore: Math.round(effectiveScore * 100) / 100,
        topCategory: maxLabel.name,
        categoryCount: categories.length,
      });
    }

    return {
      action,
      maxScore: effectiveScore,
      topCategory: maxLabel.name,
      categories,
    };
  } catch (error) {
    // Fail-closed: if Comprehend is unavailable, fall back to filterText
    // If filterText detects critical content, block it
    log.error('Comprehend DetectToxicContent failed, falling back to filterText', error);
    try {
      const fallbackResult = await filterText(text);
      if (!fallbackResult.clean && (fallbackResult.severity === 'critical' || fallbackResult.severity === 'high')) {
        log.warn('FilterText fallback blocked content after Comprehend failure', {
          severity: fallbackResult.severity,
          violations: fallbackResult.violations,
        });
        return {
          action: 'block',
          maxScore: 1.0,
          topCategory: 'HATE_SPEECH',
          categories: [],
        };
      }
    } catch (filterError) {
      log.error('FilterText fallback also failed', filterError);
    }
    return passResult;
  }
}
