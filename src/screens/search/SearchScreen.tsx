import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { AvatarImage } from '../../components/OptimizedImage';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  StatusBar,
  ActivityIndicator,
  Keyboard,
  Dimensions,
  ScrollView,
} from 'react-native';

const { width } = Dimensions.get('window');
const GRID_SIZE = (width - 4) / 3;
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { HIT_SLOP } from '../../config/theme';
import { AccountBadge } from '../../components/Badge';
import OptimizedImage from '../../components/OptimizedImage';
import { LiquidTabs } from '../../components/LiquidTabs';
import { resolveDisplayName } from '../../types/profile';
import { SearchSkeleton } from '../../components/skeleton';
import { usePrefetchProfile } from '../../hooks/queries';
import {
  searchProfiles,
  searchPosts,
  searchPeaks,
  searchByHashtag,
  getTrendingHashtags,
  getSuggestedProfiles,
  getPostById,
  getProfileById,
  getProfileByUsername,
  Profile,
  Post,
  getCurrentProfile,
} from '../../services/database';
import { isValidUUID } from '../../utils/formatters';
import { useUserSafetyStore } from '../../stores/userSafetyStore';

const PAGE_SIZE = 15;

// Smuppy URL patterns
const SMUPPY_URL_PATTERNS = {
  post: __DEV__
    ? /(?:smuppy\.app|smuppy\.com|localhost)\/p\/([a-f0-9-]{36})/i
    : /(?:smuppy\.app|smuppy\.com)\/p\/([a-f0-9-]{36})/i,
  peak: __DEV__
    ? /(?:smuppy\.app|smuppy\.com|localhost)\/peak\/([a-f0-9-]{36})/i
    : /(?:smuppy\.app|smuppy\.com)\/peak\/([a-f0-9-]{36})/i,
  profile: __DEV__
    ? /(?:smuppy\.app|smuppy\.com|localhost)\/u\/([a-zA-Z0-9_]+|[a-f0-9-]{36})/i
    : /(?:smuppy\.app|smuppy\.com)\/u\/([a-zA-Z0-9_]+|[a-f0-9-]{36})/i,
};

// ============================================
// TYPES
// ============================================

type RootStackParamList = {
  UserProfile: { userId: string };
  PostDetailFanFeed: { postId: string; fanFeedPosts: Record<string, unknown>[] };
  PeakView: { peakData?: Record<string, unknown>[]; initialIndex?: number };
  [key: string]: object | undefined;
};

type SearchTab = 'all' | 'users' | 'posts' | 'peaks' | 'tags';

// ============================================
// DEFAULT AVATAR
// ============================================
const DEFAULT_AVATAR: string | undefined = undefined;

// ============================================
// MAIN COMPONENT
// ============================================

const SearchScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const prefetchProfile = usePrefetchProfile();
  const { isHidden } = useUserSafetyStore();
  const searchInputRef = useRef<TextInput>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [linkDetected, setLinkDetected] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Results by type
  const [userResults, setUserResults] = useState<Profile[]>([]);
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [peakResults, setPeakResults] = useState<Post[]>([]);
  const [hashtagResults, setHashtagResults] = useState<Post[]>([]);

  // Suggested content (when no search)
  const [suggestedProfiles, setSuggestedProfiles] = useState<Profile[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);

  // Pagination
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Cursor refs for search endpoints that use cursor-based pagination
  const postsCursorRef = useRef<string | null>(null);
  const tagsCursorRef = useRef<string | null>(null);
  const peaksCursorRef = useRef<string | null>(null);
  const usersCursorRef = useRef<string | null>(null);

  // Load current user on mount
  useEffect(() => {
    let mounted = true;
    const loadCurrentUser = async () => {
      try {
        const { data: currentProfile } = await getCurrentProfile();
        if (mounted && currentProfile) {
          setCurrentUserId(currentProfile.id);
        }
      } catch (error) {
        if (__DEV__) console.warn('[SearchScreen] Failed to load current user:', error);
      }
    };
    loadCurrentUser();
    return () => { mounted = false; };
  }, []);

  // Detect Smuppy links and show content in results (not auto-navigate)
  const detectAndShowLinkContent = useCallback(async (query: string): Promise<boolean> => {
    setIsLoading(true);
    setHasSearched(true);
    setSearchError(null);

    try {
      // Check for post link
      const postMatch = query.match(SMUPPY_URL_PATTERNS.post);
      if (postMatch) {
        const postId = postMatch[1];
        const { data: post } = await getPostById(postId);
        if (post) {
          if (post.is_peak) {
            setPeakResults([post]);
            setPostResults([]);
            setActiveTab('peaks');
          } else {
            setPostResults([post]);
            setPeakResults([]);
            setActiveTab('posts');
          }
          setUserResults([]);
          setHashtagResults([]);
          setIsLoading(false);
          return true;
        }
      }

      // Check for peak link
      const peakMatch = query.match(SMUPPY_URL_PATTERNS.peak);
      if (peakMatch) {
        const peakId = peakMatch[1];
        const { data: peak } = await getPostById(peakId);
        if (peak) {
          setPeakResults([peak]);
          setPostResults([]);
          setUserResults([]);
          setHashtagResults([]);
          setActiveTab('peaks');
          setIsLoading(false);
          return true;
        }
      }

      // Check for profile link
      const profileMatch = query.match(SMUPPY_URL_PATTERNS.profile);
      if (profileMatch) {
        const usernameOrId = profileMatch[1];
        let profile = null;
        if (isValidUUID(usernameOrId)) {
          const { data } = await getProfileById(usernameOrId);
          profile = data;
        } else {
          const { data } = await getProfileByUsername(usernameOrId);
          profile = data;
        }
        if (profile) {
          setUserResults([profile]);
          setPostResults([]);
          setPeakResults([]);
          setHashtagResults([]);
          setActiveTab('users');
          setIsLoading(false);
          return true;
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[SearchScreen] Link detection failed:', error);
      setSearchError('Could not load linked content. Please try again.');
    }

    setIsLoading(false);
    return false;
  }, []);

  // Load suggested content
  const loadSuggestedContent = useCallback(async (signal?: { aborted: boolean }) => {
    setIsLoading(true);

    try {
      const [profilesRes, hashtagsRes] = await Promise.all([
        getSuggestedProfiles(PAGE_SIZE),
        getTrendingHashtags(10),
      ]);

      if (signal?.aborted) return;

      if (profilesRes.data) {
        setSuggestedProfiles(profilesRes.data.filter(p => p.id !== currentUserId && !isHidden(p.id)));
      }
      if (hashtagsRes.data) {
        setTrendingHashtags(hashtagsRes.data);
      }
    } catch (error) {
      if (__DEV__) console.warn('[SearchScreen] Failed to load suggested content:', error);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [currentUserId, isHidden]);

  useEffect(() => {
    const signal = { aborted: false };
    if (currentUserId) {
      loadSuggestedContent(signal);
    }
    return () => { signal.aborted = true; };
  }, [currentUserId, loadSuggestedContent]);

  // Perform search based on active tab
  const performSearch = useCallback(async (query: string, tabType: SearchTab, pageNum = 0, append = false) => {
    if (query.length < 2) {
      setUserResults([]);
      setPostResults([]);
      setPeakResults([]);
      setHashtagResults([]);
      setHasSearched(false);
      setHasMore(true);
      setSearchError(null);
      return;
    }

    if (pageNum > 0) {
      setLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setHasSearched(true);
    setSearchError(null);

    try {
      // Reset cursors on fresh search
      if (!append) {
        postsCursorRef.current = null;
        tagsCursorRef.current = null;
        peaksCursorRef.current = null;
        usersCursorRef.current = null;
      }

      // For "All" tab, search everything in parallel
      if (tabType === 'all') {
        const [usersRes, postsRes, peaksRes, tagsRes] = await Promise.all([
          searchProfiles(query, PAGE_SIZE, usersCursorRef.current ?? undefined),
          searchPosts(query, PAGE_SIZE, postsCursorRef.current ?? undefined),
          searchPeaks(query, PAGE_SIZE, peaksCursorRef.current ?? undefined),
          searchByHashtag(query, PAGE_SIZE, tagsCursorRef.current ?? undefined),
        ]);

        // Store cursors for next page
        usersCursorRef.current = usersRes.nextCursor ?? null;
        postsCursorRef.current = postsRes.nextCursor ?? null;
        peaksCursorRef.current = peaksRes.nextCursor ?? null;
        tagsCursorRef.current = tagsRes.nextCursor ?? null;

        const users = (usersRes.data || []).filter(p => p.id !== currentUserId && !isHidden(p.id));
        const posts = (postsRes.data || []).filter(p => !isHidden(p.author_id));
        const peaks = (peaksRes.data || []).filter(p => !isHidden(p.author_id));
        const tags = (tagsRes.data || []).filter(p => !isHidden(p.author_id));

        if (append) {
          setUserResults(prev => [...prev, ...users]);
          setPostResults(prev => [...prev, ...posts]);
          setPeakResults(prev => [...prev, ...peaks]);
          setHashtagResults(prev => [...prev, ...tags]);
        } else {
          setUserResults(users);
          setPostResults(posts);
          setPeakResults(peaks);
          setHashtagResults(tags);
        }

        // Has more if any category has more (use cursor exhaustion)
        const anyHasMore = (postsRes.hasMore ?? posts.length >= PAGE_SIZE)
          || (tagsRes.hasMore ?? tags.length >= PAGE_SIZE)
          || (peaksRes.hasMore ?? peaks.length >= PAGE_SIZE)
          || (usersRes.hasMore ?? users.length >= PAGE_SIZE);
        setHasMore(anyHasMore);
        return;
      }

      let newDataLength = 0;

      switch (tabType) {
        case 'users': {
          const res = await searchProfiles(query, PAGE_SIZE, usersCursorRef.current ?? undefined);
          usersCursorRef.current = res.nextCursor ?? null;
          const newUsers = (res.data || []).filter(p => p.id !== currentUserId && !isHidden(p.id));
          newDataLength = newUsers.length;
          if (append) {
            setUserResults(prev => [...prev, ...newUsers]);
          } else {
            setUserResults(newUsers);
          }
          break;
        }
        case 'posts': {
          const res = await searchPosts(query, PAGE_SIZE, postsCursorRef.current ?? undefined);
          postsCursorRef.current = res.nextCursor ?? null;
          const newPosts = (res.data || []).filter(p => !isHidden(p.author_id));
          newDataLength = newPosts.length;
          if (append) {
            setPostResults(prev => [...prev, ...newPosts]);
          } else {
            setPostResults(newPosts);
          }
          break;
        }
        case 'peaks': {
          const res = await searchPeaks(query, PAGE_SIZE, peaksCursorRef.current ?? undefined);
          peaksCursorRef.current = res.nextCursor ?? null;
          const newPeaks = (res.data || []).filter(p => !isHidden(p.author_id));
          newDataLength = newPeaks.length;
          if (append) {
            setPeakResults(prev => [...prev, ...newPeaks]);
          } else {
            setPeakResults(newPeaks);
          }
          break;
        }
        case 'tags': {
          const res = await searchByHashtag(query, PAGE_SIZE, tagsCursorRef.current ?? undefined);
          tagsCursorRef.current = res.nextCursor ?? null;
          const newHashtags = (res.data || []).filter(p => !isHidden(p.author_id));
          newDataLength = newHashtags.length;
          if (append) {
            setHashtagResults(prev => [...prev, ...newHashtags]);
          } else {
            setHashtagResults(newHashtags);
          }
          break;
        }
      }

      setHasMore(newDataLength >= PAGE_SIZE);
    } catch (error) {
      if (__DEV__) console.warn('[SearchScreen] Search failed:', error);
      setSearchError('Search failed. Please try again.');
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  }, [currentUserId, isHidden]);

  // Debounce search input with link detection
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Don't re-search if link was already detected
    if (linkDetected) {
      return;
    }

    setHasMore(true);

    if (searchQuery.length > 0) {
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          // First check if it's a Smuppy link
          const isLink = searchQuery.includes('smuppy.app') || searchQuery.includes('smuppy.com') || (__DEV__ && searchQuery.includes('localhost'));
          if (isLink) {
            const handled = await detectAndShowLinkContent(searchQuery);
            if (handled) {
              setLinkDetected(true);
              return;
            }
          }
          // If not a link or link not found, perform regular search
          await performSearch(searchQuery, activeTab, 0, false);
        } catch (error) {
          if (__DEV__) console.warn('[SearchScreen] Debounced search failed:', error);
        }
      }, 300);
    } else {
      setUserResults([]);
      setPostResults([]);
      setPeakResults([]);
      setHashtagResults([]);
      setHasSearched(false);
      setLinkDetected(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, performSearch, detectAndShowLinkContent]); // Removed activeTab from deps

  // Handle tab change separately (only for non-link searches)
  useEffect(() => {
    if (linkDetected || searchQuery.length < 2) return;

    // Check if it's a link - don't re-search
    const isLink = searchQuery.includes('smuppy.app') || searchQuery.includes('smuppy.com') || (__DEV__ && searchQuery.includes('localhost'));
    if (isLink) return;

    performSearch(searchQuery, activeTab, 0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]); // Only trigger on tab change

  // Load more
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || searchQuery.length < 2) return;
    performSearch(searchQuery, activeTab, 1, true);
  }, [loadingMore, hasMore, searchQuery, activeTab, performSearch]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const containerStyle = useMemo(() => [styles.container, { paddingTop: insets.top, backgroundColor: colors.background }], [styles.container, insets.top, colors.background]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleGoBack = useCallback((): void => {
    navigation.goBack();
  }, [navigation]);

  const handleCancelSearch = useCallback((): void => {
    setSearchQuery('');
    Keyboard.dismiss();
  }, []);

  const handleClearSearch = useCallback((): void => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  }, []);

  const handleUserPress = useCallback((userId: string): void => {
    if (!isValidUUID(userId)) {
      if (__DEV__) console.warn('[SearchScreen] Invalid userId:', userId);
      return;
    }
    prefetchProfile(userId);
    navigation.navigate('UserProfile', { userId });
  }, [prefetchProfile, navigation]);

  const handlePostPress = useCallback((post: Post): void => {
    const transformedPosts = postResults.map(p => ({
      id: p.id,
      type: p.media_type === 'video' ? 'video' : 'image',
      media: p.media_urls?.[0] || p.media_url || '',
      thumbnail: p.media_urls?.[0] || p.media_url || '',
      description: p.content || p.caption || '',
      likes: p.likes_count || 0,
      comments: p.comments_count || 0,
      user: {
        id: p.author?.id || p.author_id,
        name: resolveDisplayName(p.author),
        avatar: p.author?.avatar_url || DEFAULT_AVATAR,
        followsMe: false,
      },
    }));
    navigation.navigate('PostDetailFanFeed', { postId: post.id, fanFeedPosts: transformedPosts });
  }, [postResults, navigation]);

  const handlePeakPress = useCallback((peak: Post, index: number): void => {
    const transformedPeaks = peakResults.map(p => ({
      id: p.id,
      thumbnail: p.media_urls?.[0] || p.media_url || '',
      duration: p.peak_duration || 15,
      user: {
        id: p.author?.id || p.author_id,
        name: resolveDisplayName(p.author),
        avatar: p.author?.avatar_url || DEFAULT_AVATAR,
      },
      views: p.views_count || 0,
      likes: p.likes_count || 0,
      textOverlay: p.content || p.caption || '',
      createdAt: p.created_at, // Keep as ISO string for React Navigation serialization
    }));
    navigation.navigate('PeakView', { peakData: transformedPeaks, initialIndex: index });
  }, [peakResults, navigation]);

  const handleHashtagPress = useCallback((tag: string): void => {
    setSearchQuery(`#${tag}`);
    setActiveTab('tags');
  }, []);

  // ============================================
  // RENDER ITEMS (memoized to prevent re-renders)
  // ============================================

  const renderProfileItem = useCallback(({ item: profile }: { item: Profile }): React.JSX.Element => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => handleUserPress(profile.id)}
    >
      <AvatarImage source={profile.avatar_url || DEFAULT_AVATAR} size={50} style={styles.resultAvatar} />
      <View style={styles.resultInfo}>
        <View style={styles.usernameRow}>
          <Text style={styles.resultUsername}>{resolveDisplayName(profile)}</Text>
          <AccountBadge
            size={16}
            style={styles.badgeMargin}
            isVerified={profile.is_verified}
            accountType={profile.account_type}
          />
        </View>
        {profile.fan_count !== undefined && profile.fan_count > 0 && (
          <Text style={styles.resultMutual}>{profile.fan_count} fans</Text>
        )}
      </View>
    </TouchableOpacity>
  ), [styles, handleUserPress]);

  const renderPostItem = useCallback(({ item: post }: { item: Post }): React.JSX.Element => {
    const thumbnail = post.media_urls?.[0] || post.media_url;
    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => handlePostPress(post)}
      >
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.gridImage} />
        ) : (
          <View style={[styles.gridImage, styles.gridPlaceholder]}>
            <Ionicons name="image-outline" size={24} color={colors.grayMuted} />
          </View>
        )}
        {post.media_type === 'video' && (
          <View style={styles.videoIndicator}>
            <Ionicons name="play" size={12} color="#FFF" />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [styles, colors.grayMuted, handlePostPress]);

  const renderPeakItem = useCallback(({ item: peak, index }: { item: Post; index: number }): React.JSX.Element => {
    const thumbnail = peak.media_urls?.[0] || peak.media_url;
    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => handlePeakPress(peak, index)}
      >
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.gridImage} />
        ) : (
          <View style={[styles.gridImage, styles.gridPlaceholder]}>
            <Ionicons name="videocam-outline" size={24} color={colors.grayMuted} />
          </View>
        )}
        <View style={styles.peakDuration}>
          <Text style={styles.peakDurationText}>{peak.peak_duration || 15}s</Text>
        </View>
        <View style={styles.gridStats}>
          <Ionicons name="eye" size={12} color="#FFF" />
          <Text style={styles.gridStatText}>{peak.views_count || 0}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [styles, colors.grayMuted, handlePeakPress]);

  const renderHashtagPost = useCallback(({ item: post }: { item: Post }): React.JSX.Element => {
    const thumbnail = post.media_urls?.[0] || post.media_url;
    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => handlePostPress(post)}
      >
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.gridImage} />
        ) : (
          <View style={[styles.gridImage, styles.gridPlaceholder]}>
            <Ionicons name="image-outline" size={24} color={colors.grayMuted} />
          </View>
        )}
      </TouchableOpacity>
    );
  }, [styles, colors.grayMuted, handlePostPress]);

  // ============================================
  // RENDER TABS
  // ============================================

  // Tabs configuration for LiquidTabs
  const searchTabs = [
    { key: 'all', label: 'All' },
    { key: 'users', label: 'Users' },
    { key: 'posts', label: 'Posts' },
    { key: 'peaks', label: 'Peaks' },
    { key: 'tags', label: 'Tags' },
  ];

  const handleTabChange = useCallback((key: string) => {
    const tab = key as SearchTab;
    setActiveTab(tab);
    if (searchQuery.length >= 2 && !hasSearched) {
      performSearch(searchQuery, tab, 0, false);
    }
  }, [searchQuery, hasSearched, performSearch]);

  // "See all" handlers for All tab sections
  const handleShowAllUsers = useCallback(() => setActiveTab('users'), []);
  const handleShowAllPosts = useCallback(() => setActiveTab('posts'), []);
  const handleShowAllPeaks = useCallback(() => setActiveTab('peaks'), []);
  const handleShowAllTags = useCallback(() => setActiveTab('tags'), []);

  const renderTabs = (): React.JSX.Element => (
    <View style={styles.tabsContainer}>
      <LiquidTabs
        tabs={searchTabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        size="small"
        fullWidth={true}
        variant="glass"
        style={styles.liquidTabs}
      />
    </View>
  );

  // ============================================
  // RENDER CONTENT
  // ============================================

  const currentResults = useMemo(() => {
    switch (activeTab) {
      case 'users': return userResults;
      case 'posts': return postResults;
      case 'peaks': return peakResults;
      case 'tags': return hashtagResults;
      default: return [];
    }
  }, [activeTab, userResults, postResults, peakResults, hashtagResults]);

  const renderEmptyState = (): React.JSX.Element => (
    <View style={styles.emptyState}>
      <Ionicons name="search-outline" size={48} color={colors.grayMuted} />
      <Text style={[styles.emptyText, { color: colors.dark }]}>No results found</Text>
      <Text style={[styles.emptySubtext, { color: colors.grayMuted }]}>Try a different search</Text>
    </View>
  );

  const renderSuggestedContent = (): React.JSX.Element => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Trending Hashtags */}
      {trendingHashtags.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Trending Hashtags</Text>
          <View style={styles.hashtagsGrid}>
            {trendingHashtags.map((item, index) => (
              <TouchableOpacity
                key={`tag-${index}`}
                style={[styles.hashtagChip, { backgroundColor: colors.gray100 }]}
                onPress={() => handleHashtagPress(item.tag)}
              >
                <Text style={[styles.hashtagText, { color: colors.dark }]}>#{item.tag}</Text>
                <Text style={[styles.hashtagCount, { color: colors.gray }]}>{item.count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Suggested Profiles */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.dark }]}>Suggested</Text>
        {suggestedProfiles.map((profile) => (
          <TouchableOpacity
            key={profile.id}
            style={styles.resultItem}
            onPress={() => handleUserPress(profile.id)}
          >
            <AvatarImage source={profile.avatar_url || DEFAULT_AVATAR} size={50} style={styles.resultAvatar} />
            <View style={styles.resultInfo}>
              <View style={styles.usernameRow}>
                <Text style={[styles.resultUsername, { color: colors.dark }]}>{resolveDisplayName(profile)}</Text>
                <AccountBadge
                  size={16}
                  style={styles.badgeMargin}
                  isVerified={profile.is_verified}
                  accountType={profile.account_type}
                />
              </View>
              {profile.fan_count !== undefined && profile.fan_count > 0 && (
                <Text style={[styles.resultMutual, { color: colors.primary }]}>{profile.fan_count} fans</Text>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  // Render "All" tab with grouped sections
  const renderAllResults = (): React.JSX.Element => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Users Section */}
      {userResults.length > 0 && (
        <View style={styles.allSection}>
          <View style={styles.allSectionHeader}>
            <Text style={[styles.allSectionTitle, { color: colors.dark }]}>Users</Text>
            {userResults.length > 3 && (
              <TouchableOpacity onPress={handleShowAllUsers}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>See all ({userResults.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          {userResults.slice(0, 3).map((profile) => (
            <TouchableOpacity
              key={profile.id}
              style={styles.resultItem}
              onPress={() => handleUserPress(profile.id)}
            >
              <AvatarImage source={profile.avatar_url || DEFAULT_AVATAR} size={50} style={styles.resultAvatar} />
              <View style={styles.resultInfo}>
                <View style={styles.usernameRow}>
                  <Text style={[styles.resultUsername, { color: colors.dark }]}>{resolveDisplayName(profile)}</Text>
                  <AccountBadge
                    size={16}
                    style={styles.badgeMargin}
                    isVerified={profile.is_verified}
                    accountType={profile.account_type}
                  />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Posts Section */}
      {postResults.length > 0 && (
        <View style={styles.allSection}>
          <View style={styles.allSectionHeader}>
            <Text style={[styles.allSectionTitle, { color: colors.dark }]}>Posts</Text>
            {postResults.length > 6 && (
              <TouchableOpacity onPress={handleShowAllPosts}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>See all ({postResults.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.allGrid}>
            {postResults.slice(0, 6).map((post) => {
              const thumbnail = post.media_urls?.[0] || post.media_url;
              return (
                <TouchableOpacity
                  key={post.id}
                  style={styles.allGridItem}
                  onPress={() => handlePostPress(post)}
                >
                  {thumbnail ? (
                    <OptimizedImage source={thumbnail} style={[styles.allGridImage, { backgroundColor: colors.gray100 }]} />
                  ) : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder, { backgroundColor: colors.gray100 }]}>
                      <Ionicons name="image-outline" size={20} color={colors.grayMuted} />
                    </View>
                  )}
                  {post.media_type === 'video' && (
                    <View style={styles.videoIndicator}>
                      <Ionicons name="play" size={10} color="#FFF" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Peaks Section */}
      {peakResults.length > 0 && (
        <View style={styles.allSection}>
          <View style={styles.allSectionHeader}>
            <Text style={[styles.allSectionTitle, { color: colors.dark }]}>Peaks</Text>
            {peakResults.length > 6 && (
              <TouchableOpacity onPress={handleShowAllPeaks}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>See all ({peakResults.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.allGrid}>
            {peakResults.slice(0, 6).map((peak, index) => {
              const thumbnail = peak.media_urls?.[0] || peak.media_url;
              return (
                <TouchableOpacity
                  key={peak.id}
                  style={styles.allGridItem}
                  onPress={() => handlePeakPress(peak, index)}
                >
                  {thumbnail ? (
                    <OptimizedImage source={thumbnail} style={[styles.allGridImage, { backgroundColor: colors.gray100 }]} />
                  ) : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder, { backgroundColor: colors.gray100 }]}>
                      <Ionicons name="videocam-outline" size={20} color={colors.grayMuted} />
                    </View>
                  )}
                  <View style={styles.peakDurationSmall}>
                    <Text style={styles.peakDurationTextSmall}>{peak.peak_duration || 15}s</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Hashtag Posts Section */}
      {hashtagResults.length > 0 && (
        <View style={styles.allSection}>
          <View style={styles.allSectionHeader}>
            <Text style={[styles.allSectionTitle, { color: colors.dark }]}>Tagged Posts</Text>
            {hashtagResults.length > 6 && (
              <TouchableOpacity onPress={handleShowAllTags}>
                <Text style={[styles.seeAllText, { color: colors.primary }]}>See all ({hashtagResults.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.allGrid}>
            {hashtagResults.slice(0, 6).map((post) => {
              const thumbnail = post.media_urls?.[0] || post.media_url;
              return (
                <TouchableOpacity
                  key={post.id}
                  style={styles.allGridItem}
                  onPress={() => handlePostPress(post)}
                >
                  {thumbnail ? (
                    <OptimizedImage source={thumbnail} style={[styles.allGridImage, { backgroundColor: colors.gray100 }]} />
                  ) : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder, { backgroundColor: colors.gray100 }]}>
                      <Ionicons name="image-outline" size={20} color={colors.grayMuted} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Loading more indicator */}
      {loadingMore && (
        <View style={styles.loadingMore}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      )}
    </ScrollView>
  );

  const renderSearchResults = (): React.JSX.Element => {
    const results = currentResults;

    if (isLoading && !loadingMore) {
      return <SearchSkeleton />;
    }

    // For "All" tab, check if any results exist
    if (activeTab === 'all') {
      const totalResults = userResults.length + postResults.length + peakResults.length + hashtagResults.length;
      if (totalResults === 0 && hasSearched) {
        return renderEmptyState();
      }
      return renderAllResults();
    }

    if (results.length === 0 && hasSearched) {
      return renderEmptyState();
    }

    // Users use list layout
    if (activeTab === 'users') {
      return (
        <FlatList
          data={userResults}
          keyExtractor={(item) => item.id}
          renderItem={renderProfileItem}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : null
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
        />
      );
    }

    // Posts, Peaks, Tags use grid layout
    const data = activeTab === 'posts' ? postResults : activeTab === 'peaks' ? peakResults : hashtagResults;
    const renderItem = activeTab === 'posts' ? renderPostItem : activeTab === 'peaks' ? renderPeakItem : renderHashtagPost;

    return (
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={3}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.gridContainer}
        removeClippedSubviews={true}
        maxToRenderPerBatch={12}
        windowSize={5}
        initialNumToRender={12}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
      />
    );
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={containerStyle}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
          hitSlop={HIT_SLOP.medium}
        >
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>

        <View style={[styles.searchInputContainer, { backgroundColor: colors.gray100 }]}>
          <Ionicons name="search" size={20} color={colors.grayMuted} />
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, { color: colors.dark }]}
            placeholder={activeTab === 'tags' ? 'Search #hashtags...' : 'Search...'}
            placeholderTextColor={colors.grayMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoFocus={true}
            maxLength={200}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch}>
              <Ionicons name="close-circle" size={20} color={colors.grayMuted} />
            </TouchableOpacity>
          )}
        </View>

        {searchQuery.length > 0 && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelSearch}>
            <Text style={[styles.cancelText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      {renderTabs()}

      {/* Error Banner */}
      {searchError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{searchError}</Text>
          <TouchableOpacity onPress={() => setSearchError(null)}>
            <Ionicons name="close" size={18} color="#B91C1C" />
          </TouchableOpacity>
        </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        {searchQuery.length === 0 ? renderSuggestedContent() : renderSearchResults()}
      </View>
    </View>
  );
};

// ============================================
// STYLES
// ============================================

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.dark,
  },
  cancelButton: {
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.primary,
  },

  // Tabs
  tabsContainer: {
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  liquidTabs: {
    marginHorizontal: 16,
  },

  // Content
  content: {
    flex: 1,
  },

  // Section
  section: {
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    paddingHorizontal: 16,
    marginBottom: 12,
  },

  // Hashtags
  hashtagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 16,
  },
  hashtagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  hashtagText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.dark,
  },
  hashtagCount: {
    fontSize: 12,
    color: colors.gray,
  },

  // Result item (users)
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  resultInfo: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeMargin: {
    marginLeft: 4,
  },
  resultUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  resultFullName: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 1,
  },
  resultMutual: {
    fontSize: 12,
    color: colors.primary,
    marginTop: 2,
  },

  // All tab sections
  allSection: {
    marginBottom: 20,
  },
  allSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  allSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  seeAllText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  allGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 1,
  },
  allGridItem: {
    width: (width - 4) / 3,
    height: (width - 4) / 3,
    padding: 1,
  },
  allGridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.gray100,
  },
  peakDurationSmall: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  peakDurationTextSmall: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FFF',
  },

  // Grid (posts, peaks, tags)
  gridContainer: {
    padding: 1,
  },
  gridItem: {
    width: GRID_SIZE,
    height: GRID_SIZE,
    padding: 1,
  },
  gridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.gray100,
  },
  gridPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridStats: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  gridStatText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  videoIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  peakDuration: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  peakDurationText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.grayMuted,
    marginTop: 4,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#B91C1C',
    flex: 1,
    marginRight: 8,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 12,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default SearchScreen;
