/**
 * Group Action Handler Factory
 * Eliminates shared boilerplate across groups/join.ts and groups/leave.ts.
 *
 * Delegates the common auth/rate-limit/validate/profile/transaction pipeline
 * to createEntityActionHandler and maps group-specific concerns.
 */

import { APIGatewayProxyResult } from 'aws-lambda';
import type { PoolClient } from 'pg';
import { Logger } from './logger';
import {
  createEntityActionHandler,
  EntityRow,
} from './create-entity-action-handler';

/** Re-export for backward compatibility */
export type GroupRow = EntityRow;

interface GroupActionConfig {
  /** 'join' or 'leave' — used in error messages */
  action: 'join' | 'leave';
  /** Logger name for createLogger (e.g. 'groups-join') */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'groups-join') */
  rateLimitPrefix: string;
  /** Max requests per 1-minute window */
  rateLimitMax: number;
  /** Columns to SELECT from groups table (default: 'id') */
  groupColumns?: string;
  /**
   * Custom action executed inside a transaction.
   * The transaction is already BEGINned; the factory handles COMMIT, ROLLBACK, and client.release().
   * Return an APIGatewayProxyResult to send to the caller.
   */
  onAction: (
    client: PoolClient,
    group: GroupRow,
    profileId: string,
    groupId: string,
    headers: Record<string, string>,
    log: Logger,
  ) => Promise<APIGatewayProxyResult>;
}

/**
 * Create a group action Lambda handler with shared boilerplate.
 */
export function createGroupActionHandler(config: GroupActionConfig) {
  const {
    action,
    loggerName,
    rateLimitPrefix,
    rateLimitMax,
    groupColumns = 'id',
    onAction,
  } = config;

  return createEntityActionHandler({
    actionLabel: `${action} group`,
    loggerName,
    rateLimitPrefix,
    rateLimitMax,
    pathParamKey: 'groupId',
    buildEntityQuery: (groupId: string) => ({
      text: `SELECT ${groupColumns} FROM groups WHERE id = $1`,
      params: [groupId],
    }),
    entityNotFoundMessage: 'Group not found',
    onAction: async (ctx) => {
      return onAction(
        ctx.client,
        ctx.entity,
        ctx.profileId,
        ctx.entityId,
        ctx.headers,
        ctx.log,
      );
    },
  });
}
