/**
 * Profile Screen Mock Data
 * TODO: Remove when real API data is available
 */

// Mock data for posts
export const MOCK_POSTS = [
  {
    id: 'post-1',
    content: 'Amazing training session today! #fitness #workout',
    media_urls: ['https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400'],
    media_type: 'image',
    likes_count: 124,
    created_at: new Date().toISOString(),
  },
  {
    id: 'post-2',
    content: 'New personal record on the track',
    media_urls: ['https://images.unsplash.com/photo-1461896836934-bc?w=400'],
    media_type: 'video',
    likes_count: 89,
    created_at: new Date().toISOString(),
  },
  {
    id: 'post-3',
    content: 'Sunday morning yoga vibes',
    media_urls: ['https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400'],
    media_type: 'image',
    likes_count: 256,
    created_at: new Date().toISOString(),
  },
  {
    id: 'post-4',
    content: 'Team practice was intense today!',
    media_urls: ['https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=400'],
    media_type: 'image',
    likes_count: 67,
    created_at: new Date().toISOString(),
  },
];

// Mock data for peaks
export const MOCK_PEAKS = [
  {
    id: 'peak-1',
    content: 'Behind the scenes',
    media_urls: ['https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400'],
    peak_duration: 15,
    is_peak: true,
  },
  {
    id: 'peak-2',
    content: 'Quick workout tip',
    media_urls: ['https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400'],
    peak_duration: 10,
    is_peak: true,
  },
  {
    id: 'peak-3',
    content: 'Match highlights',
    media_urls: ['https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400'],
    peak_duration: 15,
    is_peak: true,
  },
  {
    id: 'peak-4',
    content: 'Morning routine',
    media_urls: ['https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400'],
    peak_duration: 12,
    is_peak: true,
  },
  {
    id: 'peak-5',
    content: 'Training day',
    media_urls: ['https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400'],
    peak_duration: 8,
    is_peak: true,
  },
  {
    id: 'peak-6',
    content: 'Recovery session',
    media_urls: ['https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400'],
    peak_duration: 15,
    is_peak: true,
  },
];

// Mock data for collections (saved posts)
export const MOCK_COLLECTIONS = [
  {
    id: 'saved-1',
    media_urls: ['https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400'],
    media_type: 'image',
    author: { full_name: 'Coach Mike', avatar_url: 'https://randomuser.me/api/portraits/men/32.jpg' },
  },
  {
    id: 'saved-2',
    media_urls: ['https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400'],
    media_type: 'video',
    author: { full_name: 'Sarah Sports', avatar_url: 'https://randomuser.me/api/portraits/women/44.jpg' },
  },
  {
    id: 'saved-3',
    media_urls: ['https://images.unsplash.com/photo-1518459031867-a89b944bffe4?w=400'],
    media_type: 'image',
    author: { full_name: 'FitLife', avatar_url: 'https://randomuser.me/api/portraits/men/22.jpg' },
  },
  {
    id: 'saved-4',
    media_urls: ['https://images.unsplash.com/photo-1594737625785-a6cbdabd333c?w=400'],
    media_type: 'image',
    author: { full_name: 'Yoga Master', avatar_url: 'https://randomuser.me/api/portraits/women/65.jpg' },
  },
];

// Mock data for Videos (pro_creator)
export const MOCK_VIDEOS = [
  {
    id: 'video-1',
    title: 'Full Body Workout Program - Week 1',
    thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400',
    duration: '35:20',
    visibility: 'public' as const,
    scheduledAt: null,
    views: 2847,
    createdAt: '2026-01-20',
  },
  {
    id: 'video-2',
    title: 'Advanced Techniques - Members Only',
    thumbnail: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400',
    duration: '42:15',
    visibility: 'private' as const,
    scheduledAt: null,
    views: 543,
    createdAt: '2026-01-18',
  },
  {
    id: 'video-3',
    title: 'Upcoming Program Preview',
    thumbnail: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=400',
    duration: '28:45',
    visibility: 'hidden' as const,
    scheduledAt: new Date('2026-01-25T10:00:00').toISOString(),
    views: 0,
    createdAt: '2026-01-22',
  },
  {
    id: 'video-4',
    title: 'Nutrition Tips & Meal Prep',
    thumbnail: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?w=400',
    duration: '25:30',
    visibility: 'public' as const,
    scheduledAt: null,
    views: 1234,
    createdAt: '2026-01-15',
  },
];

// Mock data for recorded Lives (pro_creator)
export const MOCK_LIVES = [
  {
    id: 'live-1',
    title: 'Morning Workout Session',
    thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400',
    duration: '45:23',
    viewers: 1234,
    date: '2026-01-22',
  },
  {
    id: 'live-2',
    title: 'Q&A with fans',
    thumbnail: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400',
    duration: '32:15',
    viewers: 856,
    date: '2026-01-20',
  },
  {
    id: 'live-3',
    title: 'Behind the scenes - Match Day',
    thumbnail: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=400',
    duration: '28:42',
    viewers: 2341,
    date: '2026-01-18',
  },
];

// Mock data for scheduled sessions (pro_creator)
export const MOCK_SESSIONS = [
  {
    id: 'session-1',
    clientName: 'John Doe',
    clientAvatar: 'https://randomuser.me/api/portraits/men/45.jpg',
    date: '2026-01-24',
    time: '14:00',
    duration: 30,
    price: 49.99,
    status: 'upcoming',
  },
  {
    id: 'session-2',
    clientName: 'Sarah Miller',
    clientAvatar: 'https://randomuser.me/api/portraits/women/32.jpg',
    date: '2026-01-25',
    time: '10:00',
    duration: 45,
    price: 69.99,
    status: 'upcoming',
  },
  {
    id: 'session-3',
    clientName: 'Mike Johnson',
    clientAvatar: 'https://randomuser.me/api/portraits/men/28.jpg',
    date: '2026-01-21',
    time: '16:30',
    duration: 30,
    price: 49.99,
    status: 'completed',
  },
];
