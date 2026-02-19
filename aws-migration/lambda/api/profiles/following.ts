/**
 * Get Profile Following Lambda Handler
 * Returns list of users a profile is following with pagination
 */

import { createFollowListHandler } from '../utils/create-follow-list-handler';

export const handler = createFollowListHandler({
  loggerName: 'profiles-following',
  joinColumn: 'following_id',
  whereColumn: 'follower_id',
  responseKey: 'following',
  errorMessage: 'Error getting following',
});
