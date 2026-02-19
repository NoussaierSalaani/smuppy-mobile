/**
 * List Expertise Lambda Handler
 * Returns all available expertise options for creator onboarding
 */

import { createListHandler } from '../utils/create-list-handler';

export const handler = createListHandler({
  tableName: 'expertise',
  loggerName: 'expertise-list',
  description: 'expertise',
});
