/**
 * Shared expertise categories for Pro Creator accounts.
 * Used by both onboarding (ExpertiseScreen) and settings (EditExpertiseScreen).
 * Single source of truth — edit here, both screens update.
 */

export interface ExpertiseItem {
  name: string;
  icon: string;
  color: string;
}

export interface ExpertiseCategory {
  category: string;
  icon: string;
  color: string;
  items: ExpertiseItem[];
}

export const ALL_EXPERTISE: ExpertiseCategory[] = [
  // Initial 4 categories
  {
    category: 'Personal Training',
    icon: 'barbell',
    color: '#FF6B6B',
    items: [
      { name: 'General Fitness', icon: 'fitness-outline', color: '#FF6B6B' },
      { name: 'Weight Loss', icon: 'scale-outline', color: '#4ECDC4' },
      { name: 'Muscle Building', icon: 'barbell-outline', color: '#34495E' },
      { name: 'Strength Training', icon: 'barbell', color: '#E74C3C' },
      { name: 'Body Transformation', icon: 'trending-up-outline', color: '#FF4081' },
      { name: 'Toning', icon: 'body-outline', color: '#9C27B0' },
      { name: 'Endurance', icon: 'heart-outline', color: '#F44336' },
      { name: 'Flexibility', icon: 'resize-outline', color: '#8BC34A' },
    ]
  },
  {
    category: 'Yoga & Pilates',
    icon: 'leaf',
    color: '#1ABC9C',
    items: [
      { name: 'Hatha Yoga', icon: 'leaf-outline', color: '#1ABC9C' },
      { name: 'Vinyasa Flow', icon: 'water-outline', color: '#00BCD4' },
      { name: 'Power Yoga', icon: 'flash-outline', color: '#FF5722' },
      { name: 'Yin Yoga', icon: 'moon-outline', color: '#673AB7' },
      { name: 'Hot Yoga', icon: 'flame-outline', color: '#FF9800' },
      { name: 'Mat Pilates', icon: 'body-outline', color: '#E91E63' },
      { name: 'Reformer Pilates', icon: 'fitness-outline', color: '#9C27B0' },
      { name: 'Prenatal Yoga', icon: 'heart-circle-outline', color: '#EC407A' },
    ]
  },
  {
    category: 'Nutrition & Diet',
    icon: 'nutrition',
    color: '#27AE60',
    items: [
      { name: 'Sports Nutrition', icon: 'nutrition-outline', color: '#27AE60' },
      { name: 'Weight Management', icon: 'scale-outline', color: '#4ECDC4' },
      { name: 'Meal Planning', icon: 'restaurant-outline', color: '#FF9800' },
      { name: 'Supplements', icon: 'medical-outline', color: '#3498DB' },
      { name: 'Keto/Low Carb', icon: 'leaf-outline', color: '#8BC34A' },
      { name: 'Vegan/Plant-Based', icon: 'leaf', color: '#4CAF50' },
      { name: 'Gut Health', icon: 'fitness-outline', color: '#9C27B0' },
      { name: 'Performance Nutrition', icon: 'rocket-outline', color: '#FF5722' },
    ]
  },
  {
    category: 'Group Fitness',
    icon: 'people',
    color: '#F39C12',
    items: [
      { name: 'HIIT Classes', icon: 'flash-outline', color: '#E67E22' },
      { name: 'CrossFit', icon: 'flame-outline', color: '#FF5722' },
      { name: 'Spin/Cycling', icon: 'bicycle-outline', color: '#795548' },
      { name: 'Bootcamp', icon: 'people-outline', color: '#4CAF50' },
      { name: 'Circuit Training', icon: 'sync-outline', color: '#00ACC1' },
      { name: 'Aerobics', icon: 'heart-outline', color: '#E91E63' },
      { name: 'Step Classes', icon: 'trending-up-outline', color: '#FF4081' },
      { name: 'Aqua Fitness', icon: 'water-outline', color: '#0288D1' },
    ]
  },
  {
    category: 'Combat Sports',
    icon: 'flash',
    color: '#D32F2F',
    items: [
      { name: 'Boxing', icon: 'fitness-outline', color: '#D32F2F' },
      { name: 'MMA', icon: 'flash', color: '#E64A19' },
      { name: 'Kickboxing', icon: 'flash-outline', color: '#FF5722' },
      { name: 'Muay Thai', icon: 'fitness', color: '#FF7043' },
      { name: 'BJJ/Jiu-Jitsu', icon: 'body-outline', color: '#388E3C' },
      { name: 'Wrestling', icon: 'people', color: '#607D8B' },
      { name: 'Karate', icon: 'hand-right-outline', color: '#F57C00' },
      { name: 'Judo', icon: 'body', color: '#1976D2' },
    ]
  },
  {
    category: 'Mind & Wellness',
    icon: 'happy',
    color: '#9B59B6',
    items: [
      { name: 'Meditation', icon: 'leaf-outline', color: '#9B59B6' },
      { name: 'Breathwork', icon: 'cloudy-outline', color: '#00ACC1' },
      { name: 'Mindfulness', icon: 'flower-outline', color: '#E91E63' },
      { name: 'Stress Management', icon: 'heart-outline', color: '#F44336' },
      { name: 'Sleep Coaching', icon: 'moon-outline', color: '#3F51B5' },
      { name: 'Life Coaching', icon: 'bulb-outline', color: '#FF9800' },
      { name: 'Mental Performance', icon: 'bulb-outline', color: '#673AB7' },
      { name: 'Relaxation', icon: 'happy-outline', color: '#4CAF50' },
    ]
  },
  {
    category: 'Sports Coaching',
    icon: 'trophy',
    color: '#FFD700',
    items: [
      { name: 'Running Coach', icon: 'walk-outline', color: '#2196F3' },
      { name: 'Swimming Coach', icon: 'water-outline', color: '#00BCD4' },
      { name: 'Tennis Coach', icon: 'tennisball-outline', color: '#C5E063' },
      { name: 'Golf Instructor', icon: 'golf-outline', color: '#228B22' },
      { name: 'Football Coach', icon: 'football-outline', color: '#8B4513' },
      { name: 'Basketball Coach', icon: 'basketball-outline', color: '#FF6B35' },
      { name: 'Triathlon Coach', icon: 'ribbon-outline', color: '#9C27B0' },
      { name: 'Cycling Coach', icon: 'bicycle-outline', color: '#795548' },
    ]
  },
  {
    category: 'Rehabilitation',
    icon: 'medkit',
    color: '#3498DB',
    items: [
      { name: 'Injury Prevention', icon: 'shield-outline', color: '#4CAF50' },
      { name: 'Post-Surgery Rehab', icon: 'medkit-outline', color: '#3498DB' },
      { name: 'Sports Injury', icon: 'bandage-outline', color: '#FF9800' },
      { name: 'Back Pain', icon: 'body-outline', color: '#F44336' },
      { name: 'Joint Mobility', icon: 'sync-outline', color: '#00ACC1' },
      { name: 'Corrective Exercise', icon: 'checkmark-circle-outline', color: '#4ECDC4' },
      { name: 'Chronic Pain', icon: 'pulse-outline', color: '#9C27B0' },
      { name: 'Physical Therapy', icon: 'fitness-outline', color: '#2196F3' },
    ]
  },
  {
    category: 'Dance & Movement',
    icon: 'musical-notes',
    color: '#E91E63',
    items: [
      { name: 'Hip Hop', icon: 'musical-notes', color: '#212121' },
      { name: 'Contemporary', icon: 'body-outline', color: '#607D8B' },
      { name: 'Ballet', icon: 'body', color: '#9C27B0' },
      { name: 'Latin Dance', icon: 'musical-notes-outline', color: '#FF9800' },
      { name: 'Zumba', icon: 'happy-outline', color: '#FF5722' },
      { name: 'Pole Dance', icon: 'barbell-outline', color: '#FF4081' },
      { name: 'Aerial Arts', icon: 'airplane-outline', color: '#00BCD4' },
      { name: 'Barre', icon: 'body-outline', color: '#E91E63' },
    ]
  },
  {
    category: 'Outdoor & Adventure',
    icon: 'trail-sign',
    color: '#5D4037',
    items: [
      { name: 'Hiking Guide', icon: 'trail-sign-outline', color: '#5D4037' },
      { name: 'Rock Climbing', icon: 'trending-up-outline', color: '#795548' },
      { name: 'Surf Instructor', icon: 'water-outline', color: '#0288D1' },
      { name: 'Ski/Snowboard', icon: 'snow-outline', color: '#42A5F5' },
      { name: 'Kayak/Paddle', icon: 'boat-outline', color: '#00897B' },
      { name: 'Trail Running', icon: 'walk-outline', color: '#4CAF50' },
      { name: 'Mountain Biking', icon: 'bicycle-outline', color: '#795548' },
      { name: 'Outdoor Fitness', icon: 'sunny-outline', color: '#FFC107' },
    ]
  },
  {
    category: 'Specialized Populations',
    icon: 'star',
    color: '#9C27B0',
    items: [
      { name: 'Senior Fitness', icon: 'people-outline', color: '#5C6BC0' },
      { name: 'Pre/Postnatal', icon: 'heart-circle-outline', color: '#EC407A' },
      { name: 'Youth/Kids', icon: 'happy-outline', color: '#FF9800' },
      { name: 'Athletes', icon: 'trophy-outline', color: '#FFD700' },
      { name: 'Beginners', icon: 'star-outline', color: '#4CAF50' },
      { name: 'Disabled/Adaptive', icon: 'accessibility-outline', color: '#2196F3' },
      { name: 'Women\'s Fitness', icon: 'female-outline', color: '#E91E63' },
      { name: 'Men\'s Health', icon: 'male-outline', color: '#1976D2' },
    ]
  },
  {
    category: 'Functional Training',
    icon: 'sync',
    color: '#00ACC1',
    items: [
      { name: 'Functional Movement', icon: 'sync-outline', color: '#00ACC1' },
      { name: 'Mobility Work', icon: 'resize-outline', color: '#8BC34A' },
      { name: 'Core Training', icon: 'fitness-outline', color: '#FF5722' },
      { name: 'Balance Training', icon: 'scale-outline', color: '#9C27B0' },
      { name: 'Stability', icon: 'shield-outline', color: '#607D8B' },
      { name: 'Kettlebells', icon: 'barbell-outline', color: '#795548' },
      { name: 'TRX/Suspension', icon: 'git-branch-outline', color: '#FF9800' },
      { name: 'Bodyweight', icon: 'body-outline', color: '#4CAF50' },
    ]
  },
  {
    category: 'Wellness Services',
    icon: 'sparkles',
    color: '#00BCD4',
    items: [
      { name: 'Massage Therapy', icon: 'hand-left-outline', color: '#8BC34A' },
      { name: 'Recovery Specialist', icon: 'bandage-outline', color: '#00BCD4' },
      { name: 'Stretching Coach', icon: 'resize-outline', color: '#FF9800' },
      { name: 'Foam Rolling', icon: 'disc-outline', color: '#607D8B' },
      { name: 'Cryotherapy', icon: 'snow-outline', color: '#2196F3' },
      { name: 'Sauna/Heat', icon: 'flame-outline', color: '#FF5722' },
    ]
  },
  {
    category: 'Performance',
    icon: 'rocket',
    color: '#FF5722',
    items: [
      { name: 'Speed Training', icon: 'flash-outline', color: '#F44336' },
      { name: 'Agility', icon: 'sync-outline', color: '#FF9800' },
      { name: 'Power Training', icon: 'rocket-outline', color: '#FF5722' },
      { name: 'Plyometrics', icon: 'arrow-up-outline', color: '#E91E63' },
      { name: 'Sport-Specific', icon: 'trophy-outline', color: '#FFD700' },
      { name: 'Competition Prep', icon: 'ribbon-outline', color: '#9C27B0' },
    ]
  },
  {
    category: 'Online Coaching',
    icon: 'videocam',
    color: '#2196F3',
    items: [
      { name: 'Virtual Training', icon: 'videocam-outline', color: '#2196F3' },
      { name: 'Program Design', icon: 'document-outline', color: '#607D8B' },
      { name: 'Online Classes', icon: 'laptop-outline', color: '#00ACC1' },
      { name: 'App-Based Coaching', icon: 'phone-portrait-outline', color: '#4CAF50' },
      { name: 'Remote Nutrition', icon: 'nutrition-outline', color: '#FF9800' },
      { name: 'Video Analysis', icon: 'videocam', color: '#9C27B0' },
    ]
  },
  {
    category: 'Lifestyle & Habits',
    icon: 'sunny',
    color: '#FFC107',
    items: [
      { name: 'Habit Coaching', icon: 'checkmark-circle-outline', color: '#4CAF50' },
      { name: 'Time Management', icon: 'time-outline', color: '#607D8B' },
      { name: 'Work-Life Balance', icon: 'scale-outline', color: '#2196F3' },
      { name: 'Motivation', icon: 'rocket-outline', color: '#FF5722' },
      { name: 'Goal Setting', icon: 'flag-outline', color: '#E91E63' },
      { name: 'Accountability', icon: 'people-outline', color: '#9C27B0' },
    ]
  },
  {
    category: 'Combat Fitness',
    icon: 'fitness',
    color: '#E64A19',
    items: [
      { name: 'Cardio Boxing', icon: 'fitness-outline', color: '#E64A19' },
      { name: 'Martial Arts Fitness', icon: 'flash-outline', color: '#FF5722' },
      { name: 'Self-Defense', icon: 'shield-outline', color: '#607D8B' },
      { name: 'Combat Conditioning', icon: 'barbell-outline', color: '#D32F2F' },
    ]
  },
  {
    category: 'Aquatic Sports',
    icon: 'water',
    color: '#0288D1',
    items: [
      { name: 'Swim Coaching', icon: 'water-outline', color: '#0288D1' },
      { name: 'Pool Fitness', icon: 'water', color: '#00ACC1' },
      { name: 'Diving', icon: 'boat-outline', color: '#0277BD' },
      { name: 'Water Sports', icon: 'boat', color: '#00897B' },
    ]
  },
  {
    category: 'Stretching & Flexibility',
    icon: 'resize',
    color: '#8BC34A',
    items: [
      { name: 'Static Stretching', icon: 'resize-outline', color: '#8BC34A' },
      { name: 'Dynamic Stretching', icon: 'sync-outline', color: '#4CAF50' },
      { name: 'PNF Stretching', icon: 'fitness-outline', color: '#00ACC1' },
      { name: 'Fascial Release', icon: 'disc-outline', color: '#9C27B0' },
      { name: 'Splits Training', icon: 'body-outline', color: '#E91E63' },
      { name: 'Contortion', icon: 'sync', color: '#FF5722' },
    ]
  },
  {
    category: 'Corporate Wellness',
    icon: 'business',
    color: '#607D8B',
    items: [
      { name: 'Office Fitness', icon: 'business-outline', color: '#607D8B' },
      { name: 'Desk Exercises', icon: 'desktop-outline', color: '#00ACC1' },
      { name: 'Team Building', icon: 'people-outline', color: '#4CAF50' },
      { name: 'Stress Workshops', icon: 'bulb-outline', color: '#FF9800' },
      { name: 'Ergonomics', icon: 'body-outline', color: '#2196F3' },
      { name: 'Lunch & Learn', icon: 'restaurant-outline', color: '#E91E63' },
    ]
  },
  {
    category: 'Holistic Health',
    icon: 'globe',
    color: '#4ECDC4',
    items: [
      { name: 'Ayurveda', icon: 'leaf-outline', color: '#FF9800' },
      { name: 'Traditional Medicine', icon: 'medical-outline', color: '#4CAF50' },
      { name: 'Energy Healing', icon: 'flash-outline', color: '#9C27B0' },
      { name: 'Acupressure', icon: 'hand-left-outline', color: '#2196F3' },
      { name: 'Reflexology', icon: 'footsteps-outline', color: '#E91E63' },
      { name: 'Aromatherapy', icon: 'flower-outline', color: '#FF5722' },
    ]
  },
  {
    category: 'Mind-Body Integration',
    icon: 'flower',
    color: '#673AB7',
    items: [
      { name: 'Tai Chi', icon: 'body-outline', color: '#607D8B' },
      { name: 'Qigong', icon: 'leaf-outline', color: '#4CAF50' },
      { name: 'Feldenkrais', icon: 'sync-outline', color: '#00ACC1' },
      { name: 'Alexander Technique', icon: 'body', color: '#9C27B0' },
      { name: 'Somatic Movement', icon: 'fitness-outline', color: '#E91E63' },
      { name: 'Body Awareness', icon: 'eye-outline', color: '#2196F3' },
    ]
  },
  {
    category: 'Weight Management',
    icon: 'scale',
    color: '#4ECDC4',
    items: [
      { name: 'Fat Loss Specialist', icon: 'trending-down-outline', color: '#4ECDC4' },
      { name: 'Metabolism Coach', icon: 'flash-outline', color: '#FF9800' },
      { name: 'Body Composition', icon: 'scale-outline', color: '#607D8B' },
      { name: 'Calorie Management', icon: 'calculator-outline', color: '#2196F3' },
      { name: 'Macro Coaching', icon: 'pie-chart-outline', color: '#9C27B0' },
      { name: 'Sustainable Weight', icon: 'leaf-outline', color: '#4CAF50' },
    ]
  },
  {
    category: 'Extreme Sports',
    icon: 'rocket',
    color: '#FF5722',
    items: [
      { name: 'Parkour', icon: 'walk-outline', color: '#607D8B' },
      { name: 'Skateboarding', icon: 'disc-outline', color: '#795548' },
      { name: 'BMX/Cycling', icon: 'bicycle-outline', color: '#FF5722' },
      { name: 'Obstacle Course', icon: 'flag-outline', color: '#E91E63' },
      { name: 'Adventure Racing', icon: 'trophy-outline', color: '#FFD700' },
      { name: 'Crossfit Games', icon: 'flame-outline', color: '#D32F2F' },
    ]
  },
];
