/**
 * Text Moderation Utility
 *
 * Centralizes the duplicated filterText + analyzeTextToxicity pattern
 * used across 19+ handlers. Runs the two-stage pipeline:
 *   1. filterText — keyword/regex filter (critical/high severity → block)
 *   2. analyzeTextToxicity — AWS Comprehend toxicity (block/flag/pass)
 *
 * Returns a structured result that handlers use to decide whether to
 * reject the request or store flag metadata on the created resource.
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import { filterText } from '../../shared/moderation/textFilter';
import { analyzeTextToxicity } from '../../shared/moderation/textModeration';
import { createLogger } from './logger';

export interface ModerationResult {
  /** Whether the content should be blocked (rejected) */
  blocked: boolean;
  /** Pre-built 400 response to return when blocked */
  blockResponse?: APIGatewayProxyResult;
  /** Whether the content was flagged for moderator review (but not blocked) */
  contentFlagged: boolean;
  /** Comprehend toxicity category (e.g. HATE_SPEECH, INSULT) when flagged */
  flagCategory: string | null;
  /** Comprehend toxicity score when flagged */
  flagScore: number | null;
}

const BLOCKED_RESULT = (headers: Record<string, string>): ModerationResult => ({
  blocked: true,
  blockResponse: {
    statusCode: 400,
    headers,
    body: JSON.stringify({ message: 'Content policy violation' }),
  },
  contentFlagged: false,
  flagCategory: null,
  flagScore: null,
});

const CLEAN_RESULT: ModerationResult = {
  blocked: false,
  contentFlagged: false,
  flagCategory: null,
  flagScore: null,
};

/**
 * Run the two-stage moderation pipeline on a single text.
 *
 * @param text    - The sanitized text to check
 * @param headers - CORS headers for building the block response
 * @param log     - Logger instance for tracing
 * @param context - Optional context string for log messages (e.g. "comment", "peak caption")
 */
export async function moderateText(
  text: string,
  headers: Record<string, string>,
  log: ReturnType<typeof createLogger>,
  context?: string,
): Promise<ModerationResult> {
  // Stage 1: Keyword/regex filter
  const filterResult = await filterText(text);
  if (!filterResult.clean && (filterResult.severity === 'critical' || filterResult.severity === 'high')) {
    log.warn(`Text blocked by filter${context ? ` (${context})` : ''}`, { severity: filterResult.severity });
    return BLOCKED_RESULT(headers);
  }

  // Stage 2: AWS Comprehend toxicity
  const toxicity = await analyzeTextToxicity(text);
  if (toxicity.action === 'block') {
    log.info(`Text blocked by Comprehend${context ? ` (${context})` : ''}`, {
      topCategory: toxicity.topCategory,
      score: toxicity.maxScore,
    });
    return BLOCKED_RESULT(headers);
  }

  if (toxicity.action === 'flag') {
    return {
      blocked: false,
      contentFlagged: true,
      flagCategory: toxicity.topCategory,
      flagScore: toxicity.maxScore,
    };
  }

  return CLEAN_RESULT;
}

/**
 * Run the moderation pipeline on multiple texts (e.g. name + description).
 * Returns blocked if ANY text is blocked. Merges flag results (worst wins).
 *
 * @param texts   - Array of sanitized texts to check
 * @param headers - CORS headers for building the block response
 * @param log     - Logger instance for tracing
 * @param context - Optional context string for log messages
 */
export async function moderateTexts(
  texts: string[],
  headers: Record<string, string>,
  log: ReturnType<typeof createLogger>,
  context?: string,
): Promise<ModerationResult> {
  let worstResult: ModerationResult = CLEAN_RESULT;

  for (const text of texts) {
    if (!text || text.trim().length === 0) continue;

    const result = await moderateText(text, headers, log, context);
    if (result.blocked) return result;

    // Keep the worst flag (highest score)
    if (result.contentFlagged && (!worstResult.contentFlagged || (result.flagScore ?? 0) > (worstResult.flagScore ?? 0))) {
      worstResult = result;
    }
  }

  return worstResult;
}
