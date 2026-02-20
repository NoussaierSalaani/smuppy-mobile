/**
 * Event Action Handler Factory
 * Eliminates shared boilerplate across events/join.ts and events/leave.ts.
 *
 * Delegates the common auth/rate-limit/validate/profile/transaction pipeline
 * to createEntityActionHandler and maps event-specific concerns.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { PoolClient } from 'pg';
import { Logger } from './logger';
import {
  createEntityActionHandler,
  EntityRow,
} from './create-entity-action-handler';
import { assertSafeColumnList, assertSafeJoinClause } from './sql-identifiers';

/** Re-export for backward compatibility */
export type EventRow = EntityRow;

export interface EventActionContext {
  client: PoolClient;
  eventData: EventRow;
  profileId: string;
  cognitoSub: string;
  eventId: string;
  headers: Record<string, string>;
  log: Logger;
  /** Raw API Gateway event for accessing body, query params, etc. */
  rawEvent: APIGatewayProxyEvent;
}

interface EventActionConfig {
  /** 'join' or 'leave' — used in error messages */
  action: 'join' | 'leave';
  /** Logger name for createLogger (e.g. 'events-join') */
  loggerName: string;
  /** Rate limit key prefix (e.g. 'events-join') */
  rateLimitPrefix: string;
  /** Max requests per 1-minute window */
  rateLimitMax: number;
  /** Columns to SELECT from events table (default: 'id'). Use table alias when eventJoins is set. */
  eventColumns?: string;
  /** Optional JOIN clauses appended after 'FROM events e' (e.g. 'JOIN profiles p ON e.creator_id = p.id') */
  eventJoins?: string;
  /**
   * Custom action executed inside a transaction.
   * The transaction is already BEGINned; the factory handles COMMIT, ROLLBACK, and client.release().
   * Return an APIGatewayProxyResult to send to the caller.
   */
  onAction: (ctx: EventActionContext) => Promise<APIGatewayProxyResult>;
}

/**
 * Create an event action Lambda handler with shared boilerplate.
 */
export function createEventActionHandler(config: EventActionConfig) {
  const {
    action,
    loggerName,
    rateLimitPrefix,
    rateLimitMax,
    eventColumns = 'id',
    eventJoins,
    onAction,
  } = config;

  // Defense-in-depth: validate config-provided identifiers at factory init time.
  // These are compile-time constants, never user input.
  assertSafeColumnList(eventColumns, `${loggerName}.eventColumns`);
  if (eventJoins) {
    assertSafeJoinClause(eventJoins, `${loggerName}.eventJoins`);
  }

  const tableRef = eventJoins ? 'events e' : 'events';
  const whereCol = eventJoins ? 'e.id' : 'id';
  const joinClause = eventJoins ? ` ${eventJoins}` : '';

  return createEntityActionHandler({
    actionLabel: `${action} event`,
    loggerName,
    rateLimitPrefix,
    rateLimitMax,
    pathParamKey: 'eventId',
    buildEntityQuery: (eventId: string) => ({
      text: `SELECT ${eventColumns} FROM ${tableRef}${joinClause} WHERE ${whereCol} = $1`,
      params: [eventId],
    }),
    entityNotFoundMessage: 'Event not found',
    onAction: async (ctx) => {
      return onAction({
        client: ctx.client,
        eventData: ctx.entity,
        profileId: ctx.profileId,
        cognitoSub: ctx.cognitoSub,
        eventId: ctx.entityId,
        headers: ctx.headers,
        log: ctx.log,
        rawEvent: ctx.rawEvent,
      });
    },
  });
}
