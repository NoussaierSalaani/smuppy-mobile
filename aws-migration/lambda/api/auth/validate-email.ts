/**
 * Email Validation Lambda Handler
 * Validates email format, domain existence, and MX records
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as dns from 'dns';
import { promisify } from 'util';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { createHeaders } from '../utils/cors';
import { createLogger, getRequestId } from '../utils/logger';

const log = createLogger('auth-validate-email');
const dynamoClient = new DynamoDBClient({});
const RATE_LIMIT_TABLE = process.env.RATE_LIMIT_TABLE || 'smuppy-rate-limit-staging';

const RATE_LIMIT_WINDOW_S = 60; // 1 minute
const MAX_REQUESTS = 10; // 10 validations per minute per IP

const checkRateLimit = async (ip: string): Promise<{ allowed: boolean; retryAfter?: number }> => {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `validate-email#${ip}#${Math.floor(now / RATE_LIMIT_WINDOW_S)}`;
  const windowEnd = (Math.floor(now / RATE_LIMIT_WINDOW_S) + 1) * RATE_LIMIT_WINDOW_S;

  try {
    const result = await dynamoClient.send(new UpdateItemCommand({
      TableName: RATE_LIMIT_TABLE,
      Key: { pk: { S: windowKey } },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl',
      ExpressionAttributeNames: { '#count': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':one': { N: '1' },
        ':ttl': { N: String(windowEnd + 60) },
      },
      ReturnValues: 'ALL_NEW',
    }));

    const count = parseInt(result.Attributes?.count?.N || '1', 10);
    if (count > MAX_REQUESTS) {
      return { allowed: false, retryAfter: windowEnd - now };
    }
    return { allowed: true };
  } catch (error) {
    log.error('Rate limit check failed', error);
    return { allowed: true }; // Fail-open for non-sensitive endpoint
  }
};

const resolveMx = promisify(dns.resolveMx);

// Disposable email domains (subset - expand as needed)
const DISPOSABLE_DOMAINS = new Set([
  'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'mailinator.com',
  '10minutemail.com', 'throwaway.email', 'fakeinbox.com', 'trashmail.com',
  'yopmail.com', 'maildrop.cc', 'getnada.com', 'sharklasers.com',
  'spam4.me', 'mailsac.com', 'discard.email', 'tempmail.net',
]);

// Common typos for popular domains (including typosquatting domains that exist)
const DOMAIN_TYPOS: Record<string, string> = {
  // Gmail typos
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.cim': 'gmail.com',
  'gmail.vom': 'gmail.com',
  'gmail.xom': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmaail.com': 'gmail.com',  // Typosquatting domain with real MX
  'gmaiil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  'gimail.com': 'gmail.com',
  'hmail.com': 'gmail.com',
  'g]mail.com': 'gmail.com',
  // Hotmail typos
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hitmail.com': 'hotmail.com',
  'hptmail.com': 'hotmail.com',
  // Outlook typos
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.cm': 'outlook.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outllook.com': 'outlook.com',
  'outlookk.com': 'outlook.com',
  'putlook.com': 'outlook.com',
  // Yahoo typos
  'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaoo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  // iCloud typos
  'icloud.co': 'icloud.com',
  'icloud.con': 'icloud.com',
  'icloud.cm': 'icloud.com',
  'iclould.com': 'icloud.com',
  'icloude.com': 'icloud.com',
  'icluod.com': 'icloud.com',
  'iclod.com': 'icloud.com',
  // Live typos
  'live.co': 'live.com',
  'live.con': 'live.com',
  // Orange.fr typos
  'orange.f': 'orange.fr',
  'orange.ft': 'orange.fr',
  'ornage.fr': 'orange.fr',
  // Free.fr typos
  'free.f': 'free.fr',
  'fre.fr': 'free.fr',
  // SFR typos
  'sfr.f': 'sfr.fr',
};

// Validate email format
const isValidFormat = (email: string): boolean => {
  const regex = /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/;
  return regex.test(email);
};

// Check if domain is disposable
const isDisposable = (domain: string): boolean => {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
};

// Check for domain typos
const checkTypo = (domain: string): string | null => {
  return DOMAIN_TYPOS[domain.toLowerCase()] || null;
};

// Verify domain has MX records (can receive email)
const verifyMxRecords = async (domain: string): Promise<boolean> => {
  try {
    const records = await resolveMx(domain);
    return records && records.length > 0;
  } catch {
    // Domain doesn't exist or has no MX records
    return false;
  }
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const headers = createHeaders(event);

  // Rate limit check
  const clientIp = event.requestContext.identity?.sourceIp ||
                   event.headers['X-Forwarded-For']?.split(',')[0]?.trim() ||
                   'unknown';
  const rateLimit = await checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    return {
      statusCode: 429,
      headers: {
        ...headers,
        'Retry-After': rateLimit.retryAfter?.toString() || '60',
      },
      body: JSON.stringify({
        valid: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: rateLimit.retryAfter,
      }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Missing request body'
        }),
      };
    }

    const { email } = JSON.parse(event.body);

    if (!email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Email is required'
        }),
      };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const parts = normalizedEmail.split('@');

    if (parts.length !== 2) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Invalid email format',
          details: {
            formatValid: false,
            domainExists: false,
            mxRecordsExist: false,
            isDisposable: false,
            isTypo: false,
          }
        }),
      };
    }

    const [localPart, domain] = parts;

    // Check format
    if (!isValidFormat(normalizedEmail)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Invalid email format',
          details: {
            formatValid: false,
            domainExists: false,
            mxRecordsExist: false,
            isDisposable: false,
            isTypo: false,
          }
        }),
      };
    }

    // Check for domain typos
    const suggestion = checkTypo(domain);
    if (suggestion) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: `Did you mean ${localPart}@${suggestion}?`,
          suggestion: `${localPart}@${suggestion}`,
          details: {
            formatValid: true,
            domainExists: false,
            mxRecordsExist: false,
            isDisposable: false,
            isTypo: true,
          }
        }),
      };
    }

    // Check if disposable
    if (isDisposable(domain)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'Temporary email addresses are not allowed',
          details: {
            formatValid: true,
            domainExists: true,
            mxRecordsExist: true,
            isDisposable: true,
            isTypo: false,
          }
        }),
      };
    }

    // Verify MX records (domain can receive email)
    const hasMx = await verifyMxRecords(domain);
    if (!hasMx) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          valid: false,
          error: 'This email domain cannot receive emails. Please check for typos.',
          details: {
            formatValid: true,
            domainExists: false,
            mxRecordsExist: false,
            isDisposable: false,
            isTypo: false,
          }
        }),
      };
    }

    // All checks passed
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        email: normalizedEmail,
        details: {
          formatValid: true,
          domainExists: true,
          mxRecordsExist: true,
          isDisposable: false,
          isTypo: false,
        }
      }),
    };

  } catch (error: unknown) {
    log.error('ValidateEmail error', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        valid: false,
        error: 'Validation failed. Please try again.',
      }),
    };
  }
};
