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
  ScrollView,
} from 'react-native';

import { WIDTH_CAPPED } from '../../utils/responsive';

const GRID_SIZE = (WIDTH_CAPPED - 4) / 3;
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
  getDiscoverPosts,
  getRecentPeaks,
  getPostById,
  getProfileById,
  getProfileByUsername,
  Profile,
  Post,
  getCurrentProfile,
} from '../../services/database';
import type { MainStackParamList, Peak } from '../../types';
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
    ? /(?:smuppy\.app|smuppy\.com|localhost)\/u\/(\w+|[a-f0-9-]{36})/i
    : /(?:smuppy\.app|smuppy\.com)\/u\/(\w+|[a-f0-9-]{36})/i,
};

type SearchTab = 'all' | 'users' | 'posts' | 'peaks' | 'tags';

const DEFAULT_AVATAR: string | undefined = undefined;

const EMPTY_STATE_MESSAGES: Record<SearchTab, { title: string; subtitle: string }> = {
  all: { title: 'No results found', subtitle: 'Try a different search' },
  users: { title: 'No users found', subtitle: 'Try searching by username or name' },
  posts: { title: 'No posts found', subtitle: 'Try different keywords' },
  peaks: { title: 'No peaks found', subtitle: 'Try different keywords' },
  tags: { title: 'No tagged posts found', subtitle: 'Try a different hashtag' },
};

const SearchScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<MainStackParamList>>();
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

  const [userResults, setUserResults] = useState<Profile[]>([]);
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [peakResults, setPeakResults] = useState<Post[]>([]);
  const [hashtagResults, setHashtagResults] = useState<Post[]>([]);

  const [suggestedProfiles, setSuggestedProfiles] = useState<Profile[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);
  const [discoverPosts, setDiscoverPosts] = useState<Post[]>([]);
  const [defaultPeaks, setDefaultPeaks] = useState<Post[]>([]);

  const postResultsRef = useRef<Post[]>([]);
  postResultsRef.current = postResults;

  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const postsCursorRef = useRef<string | null>(null);
  const tagsCursorRef = useRef<string | null>(null);
  const peaksCursorRef = useRef<string | null>(null);
  const usersCursorRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadCurrentUser = async () => {
      try {
        const { data: currentProfile } = await getCurrentProfile();
        if (mounted && currentProfile) {
          setCurrentUserId(currentProfile.id);
        }
      } catch (error_) {
        if (__DEV__) console.warn('[SearchScreen] Failed to load current user:', error_);
      }
    };
    loadCurrentUser();
    return () => { mounted = false; };
  }, []);

  const detectAndShowLinkContent = useCallback(async (query: string): Promise<boolean> => {
    setIsLoading(true);
    setHasSearched(true);
    setSearchError(null);

    try {
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
    } catch (error_) {
      if (__DEV__) console.warn('[SearchScreen] Link detection failed:', error_);
      setSearchError('Could not load linked content. Please try again.');
    }

    setIsLoading(false);
    return false;
  }, []);

  const loadSuggestedContent = useCallback(async (signal?: { aborted: boolean }) => {
    setIsLoading(true);
    try {
      const [profilesRes, hashtagsRes, postsRes, peaksRes] = await Promise.all([
        getSuggestedProfiles(PAGE_SIZE),
        getTrendingHashtags(10),
        getDiscoverPosts(PAGE_SIZE),
        getRecentPeaks(PAGE_SIZE),
      ]);
      if (signal?.aborted) return;
      if (profilesRes.data) setSuggestedProfiles(profilesRes.data.filter(p => p.id !== currentUserId && !isHidden(p.id)));
      if (hashtagsRes.data) setTrendingHashtags(hashtagsRes.data);
      if (postsRes.data) setDiscoverPosts(postsRes.data.filter(p => !isHidden(p.author_id)));
      if (peaksRes.data) setDefaultPeaks(peaksRes.data.filter(p => !isHidden(p.author_id)));
    } catch (error_) {
      if (__DEV__) console.warn('[SearchScreen] Failed to load suggested content:', error_);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, [currentUserId, isHidden]);

  useEffect(() => {
    const signal = { aborted: false };
    if (currentUserId) loadSuggestedContent(signal);
    return () => { signal.aborted = true; };
  }, [currentUserId, loadSuggestedContent]);

  const performSearch = useCallback(async (query: string, tabType: SearchTab, pageNum = 0, append = false) => {
    if (query.length < 2) {
      setUserResults([]); setPostResults([]); setPeakResults([]); setHashtagResults([]);
      setHasSearched(false); setHasMore(true); setSearchError(null);
      return;
    }
    if (pageNum > 0) { setLoadingMore(true); } else { setIsLoading(true); }
    setHasSearched(true); setSearchError(null);

    try {
      if (!append) {
        postsCursorRef.current = null; tagsCursorRef.current = null;
        peaksCursorRef.current = null; usersCursorRef.current = null;
      }

      if (tabType === 'all') {
        const [usersRes, postsRes, peaksRes, tagsRes] = await Promise.all([
          searchProfiles(query, PAGE_SIZE, usersCursorRef.current ?? undefined),
          searchPosts(query, PAGE_SIZE, postsCursorRef.current ?? undefined),
          searchPeaks(query, PAGE_SIZE, peaksCursorRef.current ?? undefined),
          searchByHashtag(query, PAGE_SIZE, tagsCursorRef.current ?? undefined),
        ]);
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
          setUserResults(users); setPostResults(posts);
          setPeakResults(peaks); setHashtagResults(tags);
        }
        setHasMore(!!(usersRes.hasMore || postsRes.hasMore || peaksRes.hasMore || tagsRes.hasMore));
        return;
      }

      let resHasMore = false;
      switch (tabType) {
        case 'users': {
          const res = await searchProfiles(query, PAGE_SIZE, usersCursorRef.current ?? undefined);
          usersCursorRef.current = res.nextCursor ?? null;
          resHasMore = !!res.hasMore;
          const newUsers = (res.data || []).filter(p => p.id !== currentUserId && !isHidden(p.id));
          if (append) { setUserResults(prev => [...prev, ...newUsers]); } else { setUserResults(newUsers); }
          break;
        }
        case 'posts': {
          const res = await searchPosts(query, PAGE_SIZE, postsCursorRef.current ?? undefined);
          postsCursorRef.current = res.nextCursor ?? null;
          resHasMore = !!res.hasMore;
          const newPosts = (res.data || []).filter(p => !isHidden(p.author_id));
          if (append) { setPostResults(prev => [...prev, ...newPosts]); } else { setPostResults(newPosts); }
          break;
        }
        case 'peaks': {
          const res = await searchPeaks(query, PAGE_SIZE, peaksCursorRef.current ?? undefined);
          peaksCursorRef.current = res.nextCursor ?? null;
          resHasMore = !!res.hasMore;
          const newPeaks = (res.data || []).filter(p => !isHidden(p.author_id));
          if (append) { setPeakResults(prev => [...prev, ...newPeaks]); } else { setPeakResults(newPeaks); }
          break;
        }
        case 'tags': {
          const res = await searchByHashtag(query, PAGE_SIZE, tagsCursorRef.current ?? undefined);
          tagsCursorRef.current = res.nextCursor ?? null;
          resHasMore = !!res.hasMore;
          const newTags = (res.data || []).filter(p => !isHidden(p.author_id));
          if (append) { setHashtagResults(prev => [...prev, ...newTags]); } else { setHashtagResults(newTags); }
          break;
        }
      }
      setHasMore(resHasMore);
    } catch (error_) {
      if (__DEV__) console.warn('[SearchScreen] Search failed:', error_);
      setSearchError('Search failed. Please try again.');
    } finally {
      setIsLoading(false); setLoadingMore(false);
    }
  }, [currentUserId, isHidden]);

  const isSmuppyLink = useCallback((q: string): boolean => {
    return q.includes('smuppy.app') || q.includes('smuppy.com') || (__DEV__ && q.includes('localhost'));
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (linkDetected && !isSmuppyLink(searchQuery)) setLinkDetected(false);
    if (linkDetected) return;
    setHasMore(true);

    if (searchQuery.length > 0) {
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          if (isSmuppyLink(searchQuery)) {
            const handled = await detectAndShowLinkContent(searchQuery);
            if (handled) { setLinkDetected(true); return; }
          }
          await performSearch(searchQuery, activeTab, 0, false);
        } catch (error_) {
          if (__DEV__) console.warn('[SearchScreen] Debounced search failed:', error_);
        }
      }, 300);
    } else {
      setUserResults([]); setPostResults([]); setPeakResults([]); setHashtagResults([]);
      setHasSearched(false); setLinkDetected(false);
    }
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, performSearch, detectAndShowLinkContent]);

  useEffect(() => {
    if (linkDetected || searchQuery.length < 2) return;
    if (isSmuppyLink(searchQuery)) return;
    performSearch(searchQuery, activeTab, 0, false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || searchQuery.length < 2) return;
    performSearch(searchQuery, activeTab, 1, true);
  }, [loadingMore, hasMore, searchQuery, activeTab, performSearch]);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const containerStyle = useMemo(() => [styles.container, { paddingTop: insets.top, backgroundColor: colors.background }], [styles.container, insets.top, colors.background]);

  const handleGoBack = useCallback((): void => { navigation.goBack(); }, [navigation]);
  const handleCancelSearch = useCallback((): void => { setSearchQuery(''); Keyboard.dismiss(); }, []);
  const handleClearSearch = useCallback((): void => { setSearchQuery(''); searchInputRef.current?.focus(); }, []);

  const handleUserPress = useCallback((userId: string): void => {
    if (!isValidUUID(userId)) { if (__DEV__) console.warn('[SearchScreen] Invalid userId:', userId); return; }
    prefetchProfile(userId);
    navigation.navigate('UserProfile', { userId });
  }, [prefetchProfile, navigation]);

  const handlePostPress = useCallback((post: Post): void => {
    const currentPosts = postResultsRef.current;
    const transformedPosts = currentPosts.map(p => ({
      id: p.id, type: p.media_type === 'video' ? 'video' as const : 'image' as const,
      media: p.media_urls?.[0] || p.media_url || '', thumbnail: p.media_urls?.[0] || p.media_url || '',
      description: p.content || p.caption || '', likes: p.likes_count || 0, comments: p.comments_count || 0,
      user: { id: p.author?.id || p.author_id, name: resolveDisplayName(p.author), avatar: p.author?.avatar_url || DEFAULT_AVATAR || '', followsMe: false },
    }));
    navigation.navigate('PostDetailFanFeed', { postId: post.id, fanFeedPosts: transformedPosts });
  }, [navigation]);

  const handlePeakPress = useCallback((peak: Post, index: number): void => {
    const transformedPeaks = peakResults.map(p => ({
      id: p.id, thumbnail: p.media_urls?.[0] || p.media_url || '',
      duration: Number(p.peak_duration) || 0,
      user: { id: p.author?.id || p.author_id, name: resolveDisplayName(p.author), avatar: p.author?.avatar_url || DEFAULT_AVATAR },
      views: p.views_count || 0, likes: p.likes_count || 0,
      textOverlay: p.content || p.caption || '', createdAt: p.created_at,
    }));
    navigation.navigate('PeakView', { peakData: transformedPeaks as unknown as Peak[], initialIndex: index });
  }, [peakResults, navigation]);

  const handleHashtagPress = useCallback((tag: string): void => {
    setSearchQuery(`#${tag}`); setActiveTab('tags');
  }, []);

  const renderProfileItem = useCallback(({ item: profile }: { item: Profile }): React.JSX.Element => (
    <TouchableOpacity style={styles.resultItem} onPress={() => handleUserPress(profile.id)}>
      <AvatarImage source={profile.avatar_url || DEFAULT_AVATAR} size={50} style={styles.resultAvatar} />
      <View style={styles.resultInfo}>
        <View style={styles.usernameRow}>
          <Text style={styles.resultUsername}>{resolveDisplayName(profile)}</Text>
          <AccountBadge size={16} style={styles.badgeMargin} isVerified={profile.is_verified} accountType={profile.account_type} />
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
      <TouchableOpacity style={styles.gridItem} onPress={() => handlePostPress(post)}>
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.gridImage} />
        ) : (
          <View style={[styles.gridImage, styles.gridPlaceholder]}>
            <Ionicons name="image-outline" size={24} color={colors.grayMuted} />
          </View>
        )}
        {post.media_type === 'video' && (
          <View style={styles.videoIndicator}><Ionicons name="play" size={12} color="#FFF" /></View>
        )}
      </TouchableOpacity>
    );
  }, [styles, colors.grayMuted, handlePostPress]);

  const renderPeakItem = useCallback(({ item: peak, index }: { item: Post; index: number }): React.JSX.Element => {
    const thumbnail = peak.media_urls?.[0] || peak.media_url;
    const duration = Number(peak.peak_duration) || 0;
    return (
      <TouchableOpacity style={styles.gridItem} onPress={() => handlePeakPress(peak, index)}>
        {thumbnail ? (
          <OptimizedImage source={thumbnail} style={styles.gridImage} />
        ) : (
          <View style={[styles.gridImage, styles.gridPlaceholder]}>
            <Ionicons name="videocam-outline" size={24} color={colors.grayMuted} />
          </View>
        )}
        {duration > 0 && (
          <View style={styles.peakDuration}><Text style={styles.peakDurationText}>{duration}s</Text></View>
        )}
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
      <TouchableOpacity style={styles.gridItem} onPress={() => handlePostPress(post)}>
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

  const searchTabs = useMemo(() => [
    { key: 'all', label: 'All' }, { key: 'users', label: 'Users' },
    { key: 'posts', label: 'Posts' }, { key: 'peaks', label: 'Peaks' }, { key: 'tags', label: 'Tags' },
  ], []);

  const handleTabChange = useCallback((key: string) => {
    const tab = key as SearchTab;
    setActiveTab(tab);
    if (searchQuery.length >= 2 && !hasSearched) performSearch(searchQuery, tab, 0, false);
  }, [searchQuery, hasSearched, performSearch]);

  const handleShowAllUsers = useCallback(() => setActiveTab('users'), []);
  const handleShowAllPosts = useCallback(() => setActiveTab('posts'), []);
  const handleShowAllPeaks = useCallback(() => setActiveTab('peaks'), []);
  const handleShowAllTags = useCallback(() => setActiveTab('tags'), []);

  const currentResults = useMemo(() => {
    switch (activeTab) {
      case 'users': return userResults;
      case 'posts': return postResults;
      case 'peaks': return peakResults;
      case 'tags': return hashtagResults;
      default: return [];
    }
  }, [activeTab, userResults, postResults, peakResults, hashtagResults]);

  const renderEmptyState = (tab?: SearchTab): React.JSX.Element => {
    const msgs = EMPTY_STATE_MESSAGES[tab || activeTab];
    return (
      <View style={styles.emptyState}>
        <Ionicons name="search-outline" size={48} color={colors.grayMuted} />
        <Text style={[styles.emptyText, { color: colors.dark }]}>{msgs.title}</Text>
        <Text style={[styles.emptySubtext, { color: colors.grayMuted }]}>{msgs.subtitle}</Text>
      </View>
    );
  };

  const renderSuggestedContent = (): React.JSX.Element => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {trendingHashtags.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Trending Hashtags</Text>
          <View style={styles.hashtagsGrid}>
            {trendingHashtags.map((item, _idx) => (
              <TouchableOpacity key={`tag-${item.tag}`} style={[styles.hashtagChip, { backgroundColor: colors.gray100 }]} onPress={() => handleHashtagPress(item.tag)}>
                <Text style={[styles.hashtagText, { color: colors.dark }]}>#{item.tag}</Text>
                <Text style={[styles.hashtagCount, { color: colors.gray }]}>{item.count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      {suggestedProfiles.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Suggested</Text>
          {suggestedProfiles.slice(0, 5).map((profile) => (
            <TouchableOpacity key={profile.id} style={styles.resultItem} onPress={() => handleUserPress(profile.id)}>
              <AvatarImage source={profile.avatar_url || DEFAULT_AVATAR} size={50} style={styles.resultAvatar} />
              <View style={styles.resultInfo}>
                <View style={styles.usernameRow}>
                  <Text style={[styles.resultUsername, { color: colors.dark }]}>{resolveDisplayName(profile)}</Text>
                  <AccountBadge size={16} style={styles.badgeMargin} isVerified={profile.is_verified} accountType={profile.account_type} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {discoverPosts.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Discover</Text>
          <View style={styles.allGrid}>
            {discoverPosts.slice(0, 9).map((post) => {
              const thumb = post.media_urls?.[0] || post.media_url;
              return (
                <TouchableOpacity key={post.id} style={styles.allGridItem} onPress={() => handlePostPress(post)}>
                  {thumb ? <OptimizedImage source={thumb} style={[styles.allGridImage, { backgroundColor: colors.gray100 }]} /> : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder, { backgroundColor: colors.gray100 }]}><Ionicons name="image-outline" size={20} color={colors.grayMuted} /></View>
                  )}
                  {post.media_type === 'video' && <View style={styles.videoIndicator}><Ionicons name="play" size={10} color="#FFF" /></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      {defaultPeaks.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.dark }]}>Recent Peaks</Text>
          <View style={styles.allGrid}>
            {defaultPeaks.slice(0, 6).map((peak) => {
              const thumb = peak.media_urls?.[0] || peak.media_url;
              const dur = Number(peak.peak_duration) || 0;
              return (
                <TouchableOpacity key={peak.id} style={styles.allGridItem} onPress={() => handlePeakPress(peak, 0)}>
                  {thumb ? <OptimizedImage source={thumb} style={[styles.allGridImage, { backgroundColor: colors.gray100 }]} /> : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder, { backgroundColor: colors.gray100 }]}><Ionicons name="videocam-outline" size={20} color={colors.grayMuted} /></View>
                  )}
                  {dur > 0 && <View style={styles.peakDurationSmall}><Text style={styles.peakDurationTextSmall}>{dur}s</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );

  const renderDefaultTabContent = (): React.JSX.Element => {
    switch (activeTab) {
      case 'users':
        return suggestedProfiles.length === 0 ? (
          <View style={styles.emptyState}><Ionicons name="people-outline" size={48} color={colors.grayMuted} />
            <Text style={[styles.emptyText, { color: colors.dark }]}>Search for users</Text>
            <Text style={[styles.emptySubtext, { color: colors.grayMuted }]}>Find people by name or username</Text></View>
        ) : (
          <FlatList data={suggestedProfiles} keyExtractor={(item) => item.id} renderItem={renderProfileItem}
            showsVerticalScrollIndicator={false} removeClippedSubviews={true} maxToRenderPerBatch={10} windowSize={5} initialNumToRender={10} />
        );
      case 'posts':
        return discoverPosts.length === 0 ? (
          <View style={styles.emptyState}><Ionicons name="grid-outline" size={48} color={colors.grayMuted} />
            <Text style={[styles.emptyText, { color: colors.dark }]}>Search for posts</Text>
            <Text style={[styles.emptySubtext, { color: colors.grayMuted }]}>Find posts by keywords</Text></View>
        ) : (
          <FlatList data={discoverPosts} keyExtractor={(item) => item.id} renderItem={renderPostItem} numColumns={3}
            showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContainer} removeClippedSubviews={true} maxToRenderPerBatch={12} windowSize={5} initialNumToRender={12} />
        );
      case 'peaks':
        return defaultPeaks.length === 0 ? (
          <View style={styles.emptyState}><Ionicons name="videocam-outline" size={48} color={colors.grayMuted} />
            <Text style={[styles.emptyText, { color: colors.dark }]}>Search for peaks</Text>
            <Text style={[styles.emptySubtext, { color: colors.grayMuted }]}>Find short videos</Text></View>
        ) : (
          <FlatList data={defaultPeaks} keyExtractor={(item) => item.id} renderItem={renderPeakItem} numColumns={3}
            showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContainer} removeClippedSubviews={true} maxToRenderPerBatch={12} windowSize={5} initialNumToRender={12} />
        );
      case 'tags':
        return trendingHashtags.length === 0 ? (
          <View style={styles.emptyState}><Ionicons name="pricetag-outline" size={48} color={colors.grayMuted} />
            <Text style={[styles.emptyText, { color: colors.dark }]}>Search hashtags</Text>
            <Text style={[styles.emptySubtext, { color: colors.grayMuted }]}>Find posts by hashtag</Text></View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.dark }]}>Trending</Text>
              <View style={styles.hashtagsGrid}>
                {trendingHashtags.map((item, _idx) => (
                  <TouchableOpacity key={`tag-${item.tag}`} style={[styles.hashtagChip, { backgroundColor: colors.gray100 }]} onPress={() => handleHashtagPress(item.tag)}>
                    <Text style={[styles.hashtagText, { color: colors.dark }]}>#{item.tag}</Text>
                    <Text style={[styles.hashtagCount, { color: colors.gray }]}>{item.count}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        );
      default: return renderSuggestedContent();
    }
  };

  const renderAllResults = (): React.JSX.Element => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {userResults.length > 0 && (
        <View style={styles.allSection}>
          <View style={styles.allSectionHeader}>
            <Text style={[styles.allSectionTitle, { color: colors.dark }]}>Users</Text>
            {userResults.length > 3 && <TouchableOpacity onPress={handleShowAllUsers}><Text style={[styles.seeAllText, { color: colors.primary }]}>See all</Text></TouchableOpacity>}
          </View>
          {userResults.slice(0, 3).map((profile) => (
            <TouchableOpacity key={profile.id} style={styles.resultItem} onPress={() => handleUserPress(profile.id)}>
              <AvatarImage source={profile.avatar_url || DEFAULT_AVATAR} size={50} style={styles.resultAvatar} />
              <View style={styles.resultInfo}>
                <View style={styles.usernameRow}>
                  <Text style={[styles.resultUsername, { color: colors.dark }]}>{resolveDisplayName(profile)}</Text>
                  <AccountBadge size={16} style={styles.badgeMargin} isVerified={profile.is_verified} accountType={profile.account_type} />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {postResults.length > 0 && (
        <View style={styles.allSection}>
          <View style={styles.allSectionHeader}>
            <Text style={[styles.allSectionTitle, { color: colors.dark }]}>Posts</Text>
            {postResults.length > 6 && <TouchableOpacity onPress={handleShowAllPosts}><Text style={[styles.seeAllText, { color: colors.primary }]}>See all</Text></TouchableOpacity>}
          </View>
          <View style={styles.allGrid}>
            {postResults.slice(0, 6).map((post) => {
              const thumb = post.media_urls?.[0] || post.media_url;
              return (
                <TouchableOpacity key={post.id} style={styles.allGridItem} onPress={() => handlePostPress(post)}>
                  {thumb ? <OptimizedImage source={thumb} style={[styles.allGridImage, { backgroundColor: colors.gray100 }]} /> : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder, { backgroundColor: colors.gray100 }]}><Ionicons name="image-outline" size={20} color={colors.grayMuted} /></View>
                  )}
                  {post.media_type === 'video' && <View style={styles.videoIndicator}><Ionicons name="play" size={10} color="#FFF" /></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      {peakResults.length > 0 && (
        <View style={styles.allSection}>
          <View style={styles.allSectionHeader}>
            <Text style={[styles.allSectionTitle, { color: colors.dark }]}>Peaks</Text>
            {peakResults.length > 6 && <TouchableOpacity onPress={handleShowAllPeaks}><Text style={[styles.seeAllText, { color: colors.primary }]}>See all</Text></TouchableOpacity>}
          </View>
          <View style={styles.allGrid}>
            {peakResults.slice(0, 6).map((peak, idx) => {
              const thumb = peak.media_urls?.[0] || peak.media_url;
              const dur = Number(peak.peak_duration) || 0;
              return (
                <TouchableOpacity key={peak.id} style={styles.allGridItem} onPress={() => handlePeakPress(peak, idx)}>
                  {thumb ? <OptimizedImage source={thumb} style={[styles.allGridImage, { backgroundColor: colors.gray100 }]} /> : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder, { backgroundColor: colors.gray100 }]}><Ionicons name="videocam-outline" size={20} color={colors.grayMuted} /></View>
                  )}
                  {dur > 0 && <View style={styles.peakDurationSmall}><Text style={styles.peakDurationTextSmall}>{dur}s</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      {hashtagResults.length > 0 && (
        <View style={styles.allSection}>
          <View style={styles.allSectionHeader}>
            <Text style={[styles.allSectionTitle, { color: colors.dark }]}>Tagged Posts</Text>
            {hashtagResults.length > 6 && <TouchableOpacity onPress={handleShowAllTags}><Text style={[styles.seeAllText, { color: colors.primary }]}>See all</Text></TouchableOpacity>}
          </View>
          <View style={styles.allGrid}>
            {hashtagResults.slice(0, 6).map((post) => {
              const thumb = post.media_urls?.[0] || post.media_url;
              return (
                <TouchableOpacity key={post.id} style={styles.allGridItem} onPress={() => handlePostPress(post)}>
                  {thumb ? <OptimizedImage source={thumb} style={[styles.allGridImage, { backgroundColor: colors.gray100 }]} /> : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder, { backgroundColor: colors.gray100 }]}><Ionicons name="image-outline" size={20} color={colors.grayMuted} /></View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
      {loadingMore && <View style={styles.loadingMore}><ActivityIndicator size="small" color={colors.primary} /></View>}
    </ScrollView>
  );

  const renderSearchResults = (): React.JSX.Element => {
    if (isLoading && !loadingMore) return <SearchSkeleton />;
    if (activeTab === 'all') {
      const total = userResults.length + postResults.length + peakResults.length + hashtagResults.length;
      if (total === 0 && hasSearched) return renderEmptyState('all');
      return renderAllResults();
    }
    const results = currentResults;
    if (results.length === 0 && hasSearched) return renderEmptyState(activeTab);
    if (activeTab === 'users') {
      return (
        <FlatList data={userResults} keyExtractor={(item) => item.id} renderItem={renderProfileItem}
          showsVerticalScrollIndicator={false} removeClippedSubviews={true} maxToRenderPerBatch={10} windowSize={5} initialNumToRender={10}
          ListFooterComponent={loadingMore ? <View style={styles.loadingMore}><ActivityIndicator size="small" color={colors.primary} /></View> : null}
          onEndReached={loadMore} onEndReachedThreshold={0.3} />
      );
    }
    let data: typeof postResults;
    let renderItem: (info: { item: Post; index: number }) => React.JSX.Element;
    if (activeTab === 'posts') { data = postResults; renderItem = renderPostItem; }
    else if (activeTab === 'peaks') { data = peakResults; renderItem = renderPeakItem; }
    else { data = hashtagResults; renderItem = renderHashtagPost; }
    return (
      <FlatList data={data} keyExtractor={(item) => item.id} renderItem={renderItem} numColumns={3}
        showsVerticalScrollIndicator={false} contentContainerStyle={styles.gridContainer} removeClippedSubviews={true} maxToRenderPerBatch={12} windowSize={5} initialNumToRender={12}
        ListFooterComponent={loadingMore ? <View style={styles.loadingMore}><ActivityIndicator size="small" color={colors.primary} /></View> : null}
        onEndReached={loadMore} onEndReachedThreshold={0.3} />
    );
  };

  return (
    <View style={containerStyle}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack} hitSlop={HIT_SLOP.medium}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <View style={[styles.searchInputContainer, { backgroundColor: colors.gray100 }]}>
          <Ionicons name="search" size={20} color={colors.grayMuted} />
          <TextInput ref={searchInputRef} style={[styles.searchInput, { color: colors.dark }]}
            placeholder={activeTab === 'tags' ? 'Search #hashtags...' : 'Search...'} placeholderTextColor={colors.grayMuted}
            value={searchQuery} onChangeText={setSearchQuery} returnKeyType="search" autoFocus={true} maxLength={200} />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch}><Ionicons name="close-circle" size={20} color={colors.grayMuted} /></TouchableOpacity>
          )}
        </View>
        {searchQuery.length > 0 && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelSearch}>
            <Text style={[styles.cancelText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.tabsContainer}>
        <LiquidTabs tabs={searchTabs} activeTab={activeTab} onTabChange={handleTabChange} size="small" fullWidth={true} variant="glass" style={styles.liquidTabs} />
      </View>
      {searchError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{searchError}</Text>
          <TouchableOpacity onPress={() => setSearchError(null)}><Ionicons name="close" size={18} color="#B91C1C" /></TouchableOpacity>
        </View>
      )}
      <View style={styles.content}>
        {searchQuery.length === 0 ? renderDefaultTabContent() : renderSearchResults()}
      </View>
    </View>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  searchInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.gray100, borderRadius: 12, paddingHorizontal: 12, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 16, color: colors.dark },
  cancelButton: { paddingHorizontal: 4 },
  cancelText: { fontSize: 15, fontWeight: '500', color: colors.primary },
  tabsContainer: { paddingHorizontal: 0, paddingVertical: 8 },
  liquidTabs: { marginHorizontal: 16 },
  content: { flex: 1 },
  section: { paddingTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.dark, paddingHorizontal: 16, marginBottom: 12 },
  hashtagsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 16 },
  hashtagChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.gray100, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, gap: 6 },
  hashtagText: { fontSize: 14, fontWeight: '500', color: colors.dark },
  hashtagCount: { fontSize: 12, color: colors.gray },
  resultItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  resultAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 12 },
  resultInfo: { flex: 1 },
  usernameRow: { flexDirection: 'row', alignItems: 'center' },
  badgeMargin: { marginLeft: 4 },
  resultUsername: { fontSize: 15, fontWeight: '600', color: colors.dark },
  resultHandle: { fontSize: 13, color: colors.gray, marginTop: 1 },
  resultFullName: { fontSize: 13, color: colors.gray, marginTop: 1 },
  resultMutual: { fontSize: 12, color: colors.primary, marginTop: 2 },
  allSection: { marginBottom: 20 },
  allSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  allSectionTitle: { fontSize: 16, fontWeight: '600', color: colors.dark },
  seeAllText: { fontSize: 14, color: colors.primary, fontWeight: '500' },
  allGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 1 },
  allGridItem: { width: (WIDTH_CAPPED - 4) / 3, height: (WIDTH_CAPPED - 4) / 3, padding: 1 },
  allGridImage: { width: '100%', height: '100%', backgroundColor: colors.gray100 },
  peakDurationSmall: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4 },
  peakDurationTextSmall: { fontSize: 9, fontWeight: '600', color: '#FFF' },
  gridContainer: { padding: 1 },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, padding: 1 },
  gridImage: { width: '100%', height: '100%', backgroundColor: colors.gray100 },
  gridPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  gridStats: { position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, gap: 4 },
  gridStatText: { fontSize: 11, fontWeight: '600', color: '#FFF' },
  videoIndicator: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  peakDuration: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  peakDurationText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  emptyState: { alignItems: 'center', paddingTop: 100 },
  emptyText: { fontSize: 18, fontWeight: '600', color: colors.dark, marginTop: 16 },
  emptySubtext: { fontSize: 14, color: colors.grayMuted, marginTop: 4 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FEE2E2', paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 16, borderRadius: 8 },
  errorText: { fontSize: 13, color: '#B91C1C', flex: 1, marginRight: 8 },
  loadingContainer: { alignItems: 'center', paddingTop: 60 },
  loadingText: { fontSize: 14, color: colors.gray, marginTop: 12 },
  loadingMore: { paddingVertical: 20, alignItems: 'center' },
});

export default SearchScreen;
