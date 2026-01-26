/**
 * Feed Screen Mock Data
 * TODO: Remove when real API data is available
 */

// Mock Peaks data for VibesFeed
export const PEAKS_DATA = [
  {
    id: 'peak1',
    thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=200',
    user: { id: 'u1', name: 'Sarah', avatar: 'https://i.pravatar.cc/100?img=1' },
    duration: 10,
    hasNew: true,
  },
  {
    id: 'peak2',
    thumbnail: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=200',
    user: { id: 'u2', name: 'Mike', avatar: 'https://i.pravatar.cc/100?img=12' },
    duration: 6,
    hasNew: true,
  },
  {
    id: 'peak3',
    thumbnail: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=200',
    user: { id: 'u3', name: 'Emma', avatar: 'https://i.pravatar.cc/100?img=5' },
    duration: 15,
    hasNew: false,
  },
  {
    id: 'peak4',
    thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200',
    user: { id: 'u4', name: 'John', avatar: 'https://i.pravatar.cc/100?img=8' },
    duration: 10,
    hasNew: true,
  },
  {
    id: 'peak5',
    thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=200',
    user: { id: 'u5', name: 'Lisa', avatar: 'https://i.pravatar.cc/100?img=9' },
    duration: 6,
    hasNew: false,
  },
];

// Icon and color mapping for interests
export const INTEREST_DATA: Record<string, { icon: string; color: string }> = {
  // Sports
  'Football': { icon: 'football', color: '#8B4513' },
  'Basketball': { icon: 'basketball', color: '#FF6B35' },
  'Tennis': { icon: 'tennisball', color: '#C5E063' },
  'Swimming': { icon: 'water', color: '#0099CC' },
  'Running': { icon: 'walk', color: '#FF5722' },
  'Cycling': { icon: 'bicycle', color: '#E63946' },
  'Golf': { icon: 'golf', color: '#228B22' },
  'Volleyball': { icon: 'basketball-outline', color: '#FFC107' },
  // Fitness
  'Gym': { icon: 'barbell', color: '#1E90FF' },
  'CrossFit': { icon: 'fitness', color: '#FF4500' },
  'Weightlifting': { icon: 'barbell-outline', color: '#2F4F4F' },
  'Cardio': { icon: 'heart', color: '#FF1493' },
  'HIIT': { icon: 'flash', color: '#FF6347' },
  'Calisthenics': { icon: 'body', color: '#20B2AA' },
  'Pilates': { icon: 'fitness-outline', color: '#E91E63' },
  'Stretching': { icon: 'resize', color: '#8BC34A' },
  'Fitness': { icon: 'fitness', color: '#FF4500' },
  // Wellness
  'Yoga': { icon: 'body', color: '#9B59B6' },
  'Meditation': { icon: 'leaf', color: '#27AE60' },
  'Nutrition': { icon: 'nutrition', color: '#FF9800' },
  'Spa & Recovery': { icon: 'sparkles', color: '#00BCD4' },
  'Mental Health': { icon: 'happy', color: '#607D8B' },
  'Sleep': { icon: 'moon', color: '#3F51B5' },
  'Mindfulness': { icon: 'flower', color: '#E91E63' },
  'Breathwork': { icon: 'cloudy', color: '#00ACC1' },
  // Outdoor
  'Hiking': { icon: 'trail-sign', color: '#5D4037' },
  'Climbing': { icon: 'trending-up', color: '#795548' },
  'Surfing': { icon: 'water', color: '#0288D1' },
  'Skiing': { icon: 'snow', color: '#42A5F5' },
  'Camping': { icon: 'bonfire', color: '#FF7043' },
  'Trail Running': { icon: 'walk', color: '#4CAF50' },
  'Mountain Biking': { icon: 'bicycle', color: '#795548' },
  'Kayaking': { icon: 'boat', color: '#00897B' },
  // Combat Sports
  'Boxing': { icon: 'fitness', color: '#DC143C' },
  'MMA': { icon: 'fitness', color: '#D32F2F' },
  'Judo': { icon: 'body', color: '#1976D2' },
  'Karate': { icon: 'hand-right', color: '#F57C00' },
  'Taekwondo': { icon: 'flash', color: '#7B1FA2' },
  'BJJ': { icon: 'body-outline', color: '#388E3C' },
  'Kickboxing': { icon: 'fitness-outline', color: '#E64A19' },
  'Muay Thai': { icon: 'flash-outline', color: '#FF5722' },
  // Water Sports
  'Scuba Diving': { icon: 'water', color: '#0277BD' },
  'Snorkeling': { icon: 'water-outline', color: '#00ACC1' },
  'Wakeboarding': { icon: 'boat', color: '#0288D1' },
  'Water Polo': { icon: 'water', color: '#1976D2' },
  'Paddle Board': { icon: 'boat', color: '#00BCD4' },
  'Sailing': { icon: 'boat', color: '#0097A7' },
  // Recovery
  'Massage': { icon: 'hand-left', color: '#8BC34A' },
  'Physiotherapy': { icon: 'bandage', color: '#3498DB' },
  'Cryotherapy': { icon: 'snow', color: '#00BCD4' },
  'Foam Rolling': { icon: 'resize', color: '#FF9800' },
  'Sauna': { icon: 'flame', color: '#FF5722' },
  'Ice Baths': { icon: 'water', color: '#2196F3' },
  // Fallback
  'Dance': { icon: 'musical-notes', color: '#E91E63' },
};
