import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from '../../shared/db';
import { createCacheableHeaders } from './cors';
import { createLogger } from './logger';

interface ListHandlerConfig {
  tableName: string;
  loggerName: string;
  description: string;
}

export function createListHandler(config: ListHandlerConfig) {
  const log = createLogger(config.loggerName);

  return async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    log.initFromEvent(event);
    const headers = createCacheableHeaders(event, 'public, max-age=86400');

    try {
      const db = await getPool();

      const result = await db.query(
        `SELECT id, name, icon, category FROM ${config.tableName} ORDER BY category, name LIMIT 500`
      );

      const data = result.rows.map((row: { id: string; name: string; icon: string; category: string }) => ({
        id: row.id,
        name: row.name,
        icon: row.icon,
        category: row.category,
      }));

      log.info(`Listed ${config.description}`, { count: data.length });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, data }),
      };
    } catch (error: unknown) {
      log.error(`Error listing ${config.description}`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Internal server error' }),
      };
    }
  };
}
