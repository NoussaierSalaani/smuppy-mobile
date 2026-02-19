/**
 * Get Profile Followers Lambda Handler
 * Returns list of users following a profile with pagination
 */

import { createFollowListHandler } from '../utils/create-follow-list-handler';

export const handler = createFollowListHandler({
  loggerName: 'profiles-followers',
  joinColumn: 'follower_id',
  whereColumn: 'following_id',
  responseKey: 'followers',
  errorMessage: 'Error getting followers',
});
