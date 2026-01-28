/**
 * Demo Profiles Data
 * Realistic demo profiles for app testing and demos
 * These profiles are marked with is_bot=true in the database
 */

export interface DemoProfile {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string;
  account_type: 'personal' | 'pro_creator' | 'pro_business';
  bio: string;
  expertise: string[];
  interests: string[];
  location: string;
  is_verified: boolean;
  business_name?: string;
  business_category?: string;
  fan_count: number;
  following_count: number;
  post_count: number;
}

// Demo Profiles - Pro Creators (Fitness)
export const DEMO_PROFILES: DemoProfile[] = [
  {
    id: 'demo-001-alex-fitness',
    username: 'alex_fitness_pro',
    full_name: 'Alex Martin',
    account_type: 'pro_creator',
    bio: 'Certified Personal Trainer | 10+ years experience | Transform your body & mind',
    expertise: ['Personal Training', 'HIIT', 'Nutrition', 'Weight Loss'],
    interests: ['Fitness', 'Healthy Living', 'Motivation'],
    avatar_url: 'https://images.unsplash.com/photo-1567013127542-490d757e51fc?w=200',
    location: 'Los Angeles, CA',
    is_verified: true,
    fan_count: 12500,
    following_count: 342,
    post_count: 156,
  },
  {
    id: 'demo-002-sarah-yoga',
    username: 'sarah_yoga_master',
    full_name: 'Sarah Johnson',
    account_type: 'pro_creator',
    bio: 'RYT-500 Yoga Instructor | Mindfulness Coach | Find your inner peace',
    expertise: ['Yoga', 'Meditation', 'Breathwork', 'Flexibility'],
    interests: ['Wellness', 'Mindfulness', 'Nature'],
    avatar_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
    location: 'San Diego, CA',
    is_verified: true,
    fan_count: 28900,
    following_count: 567,
    post_count: 234,
  },
  {
    id: 'demo-003-mike-strongman',
    username: 'mike_strongman',
    full_name: 'Mike Thompson',
    account_type: 'pro_creator',
    bio: 'Powerlifting Champion | Strength Coach | Build unstoppable power',
    expertise: ['Powerlifting', 'Strength Training', 'Sports Nutrition'],
    interests: ['Strength Sports', 'Competition', 'Recovery'],
    avatar_url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c149a?w=200',
    location: 'Austin, TX',
    is_verified: true,
    fan_count: 45200,
    following_count: 189,
    post_count: 312,
  },
  {
    id: 'demo-004-emma-crossfit',
    username: 'emma_crossfit',
    full_name: 'Emma Williams',
    account_type: 'pro_creator',
    bio: 'CrossFit Level 3 Trainer | Competition Coach | Push your limits',
    expertise: ['CrossFit', 'Olympic Lifting', 'Conditioning'],
    interests: ['CrossFit Games', 'Functional Fitness', 'Community'],
    avatar_url: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=200',
    location: 'Miami, FL',
    is_verified: false,
    fan_count: 8700,
    following_count: 423,
    post_count: 98,
  },
  {
    id: 'demo-005-david-nutrition',
    username: 'david_nutrition',
    full_name: 'David Chen',
    account_type: 'pro_creator',
    bio: 'Sports Nutritionist | Meal Prep Expert | Fuel your performance',
    expertise: ['Nutrition', 'Meal Planning', 'Sports Nutrition', 'Weight Management'],
    interests: ['Healthy Eating', 'Cooking', 'Science'],
    avatar_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200',
    location: 'New York, NY',
    is_verified: true,
    fan_count: 19800,
    following_count: 234,
    post_count: 187,
  },
  // Combat Sports
  {
    id: 'demo-006-luis-boxing',
    username: 'luis_boxing',
    full_name: 'Luis Rodriguez',
    account_type: 'pro_creator',
    bio: 'Former Pro Boxer | Boxing Coach | Train like a champion',
    expertise: ['Boxing', 'Conditioning', 'Self-Defense'],
    interests: ['Boxing', 'Combat Sports', 'Discipline'],
    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    location: 'Las Vegas, NV',
    is_verified: true,
    fan_count: 34500,
    following_count: 156,
    post_count: 267,
  },
  {
    id: 'demo-007-kenji-mma',
    username: 'kenji_mma',
    full_name: 'Kenji Tanaka',
    account_type: 'pro_creator',
    bio: 'MMA Fighter | BJJ Black Belt | Master all disciplines',
    expertise: ['MMA', 'BJJ', 'Wrestling', 'Muay Thai'],
    interests: ['Martial Arts', 'Competition', 'Teaching'],
    avatar_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
    location: 'San Jose, CA',
    is_verified: false,
    fan_count: 15600,
    following_count: 298,
    post_count: 145,
  },
  // Pro Local - Gyms & Studios
  {
    id: 'demo-008-ironforge-gym',
    username: 'ironforge_gym',
    full_name: 'Iron Forge Fitness',
    account_type: 'pro_business',
    bio: 'Premium 24/7 Gym | State-of-the-art equipment | Personal training available',
    expertise: ['Gym', 'Personal Training', 'Group Classes'],
    interests: ['Fitness Community', 'Equipment', 'Training'],
    avatar_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200',
    location: 'Downtown LA',
    is_verified: true,
    business_name: 'Iron Forge Fitness Center',
    business_category: 'gym',
    fan_count: 5600,
    following_count: 45,
    post_count: 89,
  },
  {
    id: 'demo-009-zenflow-studio',
    username: 'zenflow_studio',
    full_name: 'ZenFlow Yoga Studio',
    account_type: 'pro_business',
    bio: 'Boutique yoga studio | Hot yoga, Vinyasa, Restorative | Find your flow',
    expertise: ['Yoga Classes', 'Meditation', 'Wellness Programs'],
    interests: ['Yoga', 'Wellness', 'Community'],
    avatar_url: 'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=200',
    location: 'Santa Monica, CA',
    is_verified: true,
    business_name: 'ZenFlow Yoga Studio',
    business_category: 'studio',
    fan_count: 3200,
    following_count: 67,
    post_count: 56,
  },
  // Personal Users
  {
    id: 'demo-010-john-newbie',
    username: 'fitness_newbie_john',
    full_name: 'John Miller',
    account_type: 'personal',
    bio: 'Starting my fitness journey | Looking for motivation',
    expertise: [],
    interests: ['Weight Loss', 'Running', 'Healthy Eating'],
    avatar_url: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=200',
    location: 'Chicago, IL',
    is_verified: false,
    fan_count: 45,
    following_count: 234,
    post_count: 12,
  },
  {
    id: 'demo-011-lisa-runner',
    username: 'lisa_runner',
    full_name: 'Lisa Anderson',
    account_type: 'personal',
    bio: 'Marathon runner in training | 5K to 42K journey',
    expertise: [],
    interests: ['Running', 'Cardio', 'Outdoor Activities'],
    avatar_url: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200',
    location: 'Boston, MA',
    is_verified: false,
    fan_count: 187,
    following_count: 456,
    post_count: 34,
  },
  {
    id: 'demo-012-mark-enthusiast',
    username: 'gym_enthusiast_mark',
    full_name: 'Mark Davis',
    account_type: 'personal',
    bio: 'Gym rat | Gains over everything | Always learning',
    expertise: [],
    interests: ['Bodybuilding', 'Strength Training', 'Supplements'],
    avatar_url: 'https://images.unsplash.com/photo-1557862921-37829c790f19?w=200',
    location: 'Denver, CO',
    is_verified: false,
    fan_count: 89,
    following_count: 567,
    post_count: 23,
  },
];

// Get profile by username
export const getDemoProfileByUsername = (username: string): DemoProfile | undefined => {
  return DEMO_PROFILES.find(p => p.username === username);
};

// Get profiles by type
export const getDemoProfilesByType = (type: 'personal' | 'pro_creator' | 'pro_business'): DemoProfile[] => {
  return DEMO_PROFILES.filter(p => p.account_type === type);
};

// Get verified profiles
export const getVerifiedDemoProfiles = (): DemoProfile[] => {
  return DEMO_PROFILES.filter(p => p.is_verified);
};
