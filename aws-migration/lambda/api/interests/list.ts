/**
 * List Interests Lambda Handler
 * Returns all available interests for user selection during onboarding
 */

import { createListHandler } from '../utils/create-list-handler';

export const handler = createListHandler({
  tableName: 'interests',
  loggerName: 'interests-list',
  description: 'interests',
});
