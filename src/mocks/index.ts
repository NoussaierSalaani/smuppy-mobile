/**
 * Mock Data Index
 * Centralized exports for all mock data
 * TODO: Remove mock data when real API is fully implemented
 */

export {
  MOCK_POSTS,
  MOCK_PEAKS,
  MOCK_COLLECTIONS,
  MOCK_VIDEOS,
  MOCK_LIVES,
  MOCK_SESSIONS,
} from './profileMocks';

export {
  PEAKS_DATA,
  INTEREST_DATA,
  MOCK_VIBE_POSTS,
  MOCK_FAN_POSTS,
} from './feedMocks';

export {
  DEMO_PROFILES,
  getDemoProfileByUsername,
  getDemoProfilesByType,
  getVerifiedDemoProfiles,
} from './demoProfiles';
export type { DemoProfile } from './demoProfiles';
