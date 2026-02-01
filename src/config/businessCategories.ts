/**
 * Shared business category definitions.
 * Used by onboarding (BusinessCategoryScreen), discovery, and VibesFeed icon lookup.
 * Single source of truth — edit here, all screens update.
 */

export interface BusinessCategoryItem {
  id: string;
  icon: string;
  label: string;
  color: string;
}

export const ALL_BUSINESS_CATEGORIES: BusinessCategoryItem[] = [
  { id: 'gym', icon: 'barbell-outline', label: 'Gym', color: '#1E90FF' },
  { id: 'yoga_studio', icon: 'body-outline', label: 'Yoga Studio', color: '#9B59B6' },
  { id: 'crossfit', icon: 'fitness-outline', label: 'CrossFit Box', color: '#FF4500' },
  { id: 'pool', icon: 'water-outline', label: 'Pool / Aquatics', color: '#0099CC' },
  { id: 'martial_arts', icon: 'flash-outline', label: 'Martial Arts', color: '#FF5722' },
  { id: 'dance_studio', icon: 'musical-notes-outline', label: 'Dance Studio', color: '#E91E63' },
  { id: 'wellness_spa', icon: 'leaf-outline', label: 'Wellness / Spa', color: '#27AE60' },
  { id: 'sports_club', icon: 'trophy-outline', label: 'Sports Club', color: '#FFD700' },
  { id: 'personal_training', icon: 'person-outline', label: 'Personal Training', color: '#FF6B6B' },
  { id: 'bootcamp', icon: 'people-outline', label: 'Bootcamp', color: '#4CAF50' },
  { id: 'pilates', icon: 'body', label: 'Pilates Studio', color: '#E91E63' },
  { id: 'meditation', icon: 'happy-outline', label: 'Meditation Center', color: '#607D8B' },
  { id: 'tennis', icon: 'tennisball-outline', label: 'Tennis Club', color: '#C5E063' },
  { id: 'climbing', icon: 'trending-up-outline', label: 'Climbing Gym', color: '#795548' },
  { id: 'boxing', icon: 'fitness-outline', label: 'Boxing Gym', color: '#D32F2F' },
  { id: 'running_club', icon: 'walk-outline', label: 'Running Club', color: '#2196F3' },
  { id: 'hiit_studio', icon: 'flash-outline', label: 'HIIT Studio', color: '#E67E22' },
  { id: 'swim_school', icon: 'water', label: 'Swim School', color: '#0277BD' },
  { id: 'nutrition', icon: 'nutrition-outline', label: 'Nutrition Center', color: '#FF9800' },
  { id: 'golf', icon: 'golf-outline', label: 'Golf Club', color: '#228B22' },
  { id: 'cycling', icon: 'bicycle-outline', label: 'Cycling Studio', color: '#795548' },
  { id: 'mma', icon: 'fitness', label: 'MMA Gym', color: '#E64A19' },
];
