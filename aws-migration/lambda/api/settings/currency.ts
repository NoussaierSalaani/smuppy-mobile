/**
 * Currency Settings Lambda Handler
 * Detect and manage user currency preferences
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { Pool } from 'pg';
import { cors, handleOptions } from '../utils/cors';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// IP to currency mapping (simplified)
const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  FR: 'EUR',
  DE: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  CH: 'CHF',
  AU: 'AUD',
  JP: 'JPY',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CAD: 'CA$',
  CHF: 'CHF',
  AUD: 'A$',
  JPY: '¥',
  SEK: 'kr',
  NOK: 'kr',
  DKK: 'kr',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();

  const client = await pool.connect();

  try {
    const userId = event.requestContext.authorizer?.claims?.sub;

    // GET - Get currency settings
    if (event.httpMethod === 'GET') {
      // Get all supported currencies
      const currenciesResult = await client.query(
        `SELECT code, name, symbol FROM supported_currencies
         WHERE is_active = TRUE ORDER BY code`
      );

      // Detect currency from request
      const countryCode =
        event.headers['CloudFront-Viewer-Country'] ||
        event.headers['cloudfront-viewer-country'] ||
        event.headers['X-Country-Code'] ||
        'FR'; // Default to France/EUR

      const detectedCurrency = COUNTRY_CURRENCY_MAP[countryCode] || 'EUR';

      // Get user preference if logged in
      let userCurrency = detectedCurrency;
      if (userId) {
        const userResult = await client.query(
          `SELECT preferred_currency FROM currency_settings WHERE user_id = $1`,
          [userId]
        );

        if (userResult.rows.length > 0 && userResult.rows[0].preferred_currency) {
          userCurrency = userResult.rows[0].preferred_currency;
        }
      }

      return cors({
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          currency: {
            code: userCurrency,
            symbol: CURRENCY_SYMBOLS[userCurrency] || userCurrency,
            detected: detectedCurrency,
            countryCode,
          },
          supported: currenciesResult.rows.map((c) => ({
            code: c.code,
            name: c.name,
            symbol: c.symbol,
          })),
        }),
      });
    }

    // PUT - Update currency preference
    if (event.httpMethod === 'PUT') {
      if (!userId) {
        return cors({
          statusCode: 401,
          body: JSON.stringify({ success: false, message: 'Unauthorized' }),
        });
      }

      const body = JSON.parse(event.body || '{}');
      const { currency } = body;

      if (!currency) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: 'Currency code required',
          }),
        });
      }

      // Verify currency is supported
      const currencyCheck = await client.query(
        `SELECT code FROM supported_currencies
         WHERE code = $1 AND is_active = TRUE`,
        [currency.toUpperCase()]
      );

      if (currencyCheck.rows.length === 0) {
        return cors({
          statusCode: 400,
          body: JSON.stringify({
            success: false,
            message: 'Currency not supported',
          }),
        });
      }

      // Get country from request
      const countryCode =
        event.headers['CloudFront-Viewer-Country'] ||
        event.headers['cloudfront-viewer-country'] ||
        null;

      // Upsert currency settings
      await client.query(
        `INSERT INTO currency_settings (user_id, preferred_currency, country_code, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET preferred_currency = $2, country_code = $3, updated_at = NOW()`,
        [userId, currency.toUpperCase(), countryCode]
      );

      return cors({
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          currency: {
            code: currency.toUpperCase(),
            symbol: CURRENCY_SYMBOLS[currency.toUpperCase()] || currency,
          },
          message: 'Currency preference updated',
        }),
      });
    }

    return cors({
      statusCode: 405,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    });
  } catch (error: any) {
    console.error('Currency settings error:', error);
    return cors({
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: error.message || 'Failed to process currency settings',
      }),
    });
  } finally {
    client.release();
  }
};
