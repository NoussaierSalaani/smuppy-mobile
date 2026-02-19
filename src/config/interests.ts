/**
 * Shared interest categories for Personal accounts.
 * Used by both onboarding (InterestsScreen) and settings (EditInterestsScreen).
 * Single source of truth — edit here, both screens update.
 */

import type { CategoryConfig } from './category-types';

export const ALL_INTERESTS: CategoryConfig[] = [
  // Initial 4 categories
  {
    category: 'Sports',
    icon: 'football',
    color: '#FF6B35',
    items: [
      { name: 'Football', icon: 'football', color: '#8B4513' },
      { name: 'Basketball', icon: 'basketball', color: '#FF6B35' },
      { name: 'Tennis', icon: 'tennisball', color: '#C5E063' },
      { name: 'Swimming', icon: 'water', color: '#0099CC' },
      { name: 'Running', icon: 'walk', color: '#FF5722' },
      { name: 'Cycling', icon: 'bicycle', color: '#E63946' },
      { name: 'Golf', icon: 'golf', color: '#228B22' },
      { name: 'Volleyball', icon: 'basketball-outline', color: '#FFC107' },
    ]
  },
  {
    category: 'Fitness',
    icon: 'barbell',
    color: '#1E90FF',
    items: [
      { name: 'Gym', icon: 'barbell', color: '#1E90FF' },
      { name: 'CrossFit', icon: 'fitness', color: '#FF4500' },
      { name: 'Weightlifting', icon: 'barbell-outline', color: '#2F4F4F' },
      { name: 'Cardio', icon: 'heart', color: '#FF1493' },
      { name: 'HIIT', icon: 'flash', color: '#FF6347' },
      { name: 'Calisthenics', icon: 'body', color: '#20B2AA' },
      { name: 'Pilates', icon: 'fitness-outline', color: '#E91E63' },
      { name: 'Stretching', icon: 'resize', color: '#8BC34A' },
    ]
  },
  {
    category: 'Wellness',
    icon: 'leaf',
    color: '#27AE60',
    items: [
      { name: 'Yoga', icon: 'body', color: '#9B59B6' },
      { name: 'Meditation', icon: 'leaf', color: '#27AE60' },
      { name: 'Nutrition', icon: 'nutrition', color: '#FF9800' },
      { name: 'Spa & Recovery', icon: 'sparkles', color: '#00BCD4' },
      { name: 'Mental Health', icon: 'happy', color: '#607D8B' },
      { name: 'Sleep', icon: 'moon', color: '#3F51B5' },
      { name: 'Mindfulness', icon: 'flower', color: '#E91E63' },
      { name: 'Breathwork', icon: 'cloudy', color: '#00ACC1' },
    ]
  },
  {
    category: 'Outdoor',
    icon: 'trail-sign',
    color: '#5D4037',
    items: [
      { name: 'Hiking', icon: 'trail-sign', color: '#5D4037' },
      { name: 'Climbing', icon: 'trending-up', color: '#795548' },
      { name: 'Surfing', icon: 'water', color: '#0288D1' },
      { name: 'Skiing', icon: 'snow', color: '#42A5F5' },
      { name: 'Camping', icon: 'bonfire', color: '#FF7043' },
      { name: 'Trail Running', icon: 'walk', color: '#4CAF50' },
      { name: 'Mountain Biking', icon: 'bicycle', color: '#795548' },
      { name: 'Kayaking', icon: 'boat', color: '#00897B' },
    ]
  },
  {
    category: 'Combat Sports',
    icon: 'flash',
    color: '#D32F2F',
    items: [
      { name: 'Boxing', icon: 'fitness', color: '#DC143C' },
      { name: 'MMA', icon: 'fitness', color: '#D32F2F' },
      { name: 'Judo', icon: 'body', color: '#1976D2' },
      { name: 'Karate', icon: 'hand-right', color: '#F57C00' },
      { name: 'Taekwondo', icon: 'flash', color: '#7B1FA2' },
      { name: 'BJJ', icon: 'body-outline', color: '#388E3C' },
      { name: 'Kickboxing', icon: 'fitness-outline', color: '#E64A19' },
      { name: 'Muay Thai', icon: 'flash-outline', color: '#FF5722' },
    ]
  },
  {
    category: 'Water Sports',
    icon: 'water',
    color: '#0288D1',
    items: [
      { name: 'Scuba Diving', icon: 'water', color: '#0277BD' },
      { name: 'Snorkeling', icon: 'water-outline', color: '#00ACC1' },
      { name: 'Wakeboarding', icon: 'boat', color: '#0288D1' },
      { name: 'Water Polo', icon: 'water', color: '#1976D2' },
      { name: 'Paddle Board', icon: 'boat', color: '#00BCD4' },
      { name: 'Sailing', icon: 'boat', color: '#0097A7' },
      { name: 'Kitesurfing', icon: 'flash', color: '#03A9F4' },
      { name: 'Rowing', icon: 'boat-outline', color: '#455A64' },
    ]
  },
  {
    category: 'Team Sports',
    icon: 'people',
    color: '#4CAF50',
    items: [
      { name: 'Rugby', icon: 'american-football', color: '#8D6E63' },
      { name: 'Hockey', icon: 'disc', color: '#607D8B' },
      { name: 'Handball', icon: 'basketball', color: '#FF7043' },
      { name: 'Cricket', icon: 'baseball', color: '#8BC34A' },
      { name: 'Baseball', icon: 'baseball', color: '#D32F2F' },
      { name: 'Softball', icon: 'baseball-outline', color: '#FF9800' },
      { name: 'Lacrosse', icon: 'disc-outline', color: '#9C27B0' },
      { name: 'Futsal', icon: 'football-outline', color: '#4CAF50' },
    ]
  },
  {
    category: 'Racket Sports',
    icon: 'tennisball',
    color: '#C5E063',
    items: [
      { name: 'Badminton', icon: 'tennisball-outline', color: '#4CAF50' },
      { name: 'Squash', icon: 'tennisball', color: '#2196F3' },
      { name: 'Table Tennis', icon: 'disc', color: '#FF5722' },
      { name: 'Padel', icon: 'tennisball', color: '#9C27B0' },
      { name: 'Pickleball', icon: 'tennisball-outline', color: '#00BCD4' },
      { name: 'Racquetball', icon: 'tennisball', color: '#FF9800' },
    ]
  },
  {
    category: 'Dance',
    icon: 'musical-notes',
    color: '#E91E63',
    items: [
      { name: 'Hip Hop', icon: 'musical-notes', color: '#212121' },
      { name: 'Salsa', icon: 'musical-notes-outline', color: '#E91E63' },
      { name: 'Ballet', icon: 'body-outline', color: '#9C27B0' },
      { name: 'Contemporary', icon: 'body', color: '#607D8B' },
      { name: 'Zumba', icon: 'happy', color: '#FF5722' },
      { name: 'Breakdance', icon: 'flash', color: '#F44336' },
      { name: 'Pole Dance', icon: 'barbell-outline', color: '#FF4081' },
      { name: 'Latin Dance', icon: 'musical-notes', color: '#FF9800' },
    ]
  },
  {
    category: 'Mind & Body',
    icon: 'flower',
    color: '#9B59B6',
    items: [
      { name: 'Tai Chi', icon: 'body-outline', color: '#607D8B' },
      { name: 'Qigong', icon: 'leaf-outline', color: '#4CAF50' },
      { name: 'Relaxation', icon: 'flower-outline', color: '#E91E63' },
      { name: 'Stress Relief', icon: 'heart-outline', color: '#F44336' },
      { name: 'Self-Care', icon: 'sunny-outline', color: '#FFC107' },
      { name: 'Holistic Health', icon: 'globe-outline', color: '#00BCD4' },
    ]
  },
  {
    category: 'Extreme Sports',
    icon: 'rocket',
    color: '#FF5722',
    items: [
      { name: 'Skateboarding', icon: 'disc', color: '#795548' },
      { name: 'BMX', icon: 'bicycle', color: '#FF5722' },
      { name: 'Parkour', icon: 'walk', color: '#607D8B' },
      { name: 'Skydiving', icon: 'airplane', color: '#2196F3' },
      { name: 'Bungee Jumping', icon: 'arrow-down', color: '#E91E63' },
      { name: 'Snowboarding', icon: 'snow', color: '#00BCD4' },
      { name: 'Motocross', icon: 'speedometer', color: '#F44336' },
      { name: 'Paragliding', icon: 'airplane-outline', color: '#9C27B0' },
    ]
  },
  {
    category: 'Lifestyle',
    icon: 'sunny',
    color: '#FFC107',
    items: [
      { name: 'Healthy Eating', icon: 'restaurant', color: '#4CAF50' },
      { name: 'Active Living', icon: 'walk', color: '#2196F3' },
      { name: 'Work-Life Balance', icon: 'scale', color: '#607D8B' },
      { name: 'Personal Growth', icon: 'trending-up', color: '#9C27B0' },
      { name: 'Motivation', icon: 'rocket', color: '#FF5722' },
      { name: 'Goal Setting', icon: 'flag', color: '#E91E63' },
    ]
  },
  {
    category: 'Winter Sports',
    icon: 'snow',
    color: '#42A5F5',
    items: [
      { name: 'Alpine Skiing', icon: 'snow', color: '#42A5F5' },
      { name: 'Cross-Country Ski', icon: 'walk', color: '#0288D1' },
      { name: 'Ice Skating', icon: 'snow-outline', color: '#00BCD4' },
      { name: 'Ice Hockey', icon: 'disc', color: '#607D8B' },
      { name: 'Curling', icon: 'disc-outline', color: '#795548' },
      { name: 'Bobsled', icon: 'speedometer', color: '#F44336' },
    ]
  },
  {
    category: 'Athletics',
    icon: 'ribbon',
    color: '#FFD700',
    items: [
      { name: 'Sprinting', icon: 'flash', color: '#F44336' },
      { name: 'Long Distance', icon: 'walk', color: '#4CAF50' },
      { name: 'Hurdles', icon: 'trending-up', color: '#FF9800' },
      { name: 'High Jump', icon: 'arrow-up', color: '#2196F3' },
      { name: 'Long Jump', icon: 'arrow-forward', color: '#9C27B0' },
      { name: 'Pole Vault', icon: 'trending-up', color: '#795548' },
      { name: 'Shot Put', icon: 'disc', color: '#607D8B' },
      { name: 'Javelin', icon: 'arrow-forward-outline', color: '#FF5722' },
    ]
  },
  {
    category: 'Equestrian',
    icon: 'paw',
    color: '#8D6E63',
    items: [
      { name: 'Horse Riding', icon: 'paw', color: '#8D6E63' },
      { name: 'Dressage', icon: 'ribbon', color: '#FFD700' },
      { name: 'Show Jumping', icon: 'trending-up', color: '#4CAF50' },
      { name: 'Polo', icon: 'disc', color: '#1976D2' },
    ]
  },
  {
    category: 'Recovery',
    icon: 'medkit',
    color: '#3498DB',
    items: [
      { name: 'Massage', icon: 'hand-left', color: '#8BC34A' },
      { name: 'Physiotherapy', icon: 'bandage', color: '#3498DB' },
      { name: 'Cryotherapy', icon: 'snow', color: '#00BCD4' },
      { name: 'Foam Rolling', icon: 'resize', color: '#FF9800' },
      { name: 'Sauna', icon: 'flame', color: '#FF5722' },
      { name: 'Ice Baths', icon: 'water', color: '#2196F3' },
    ]
  },
];
