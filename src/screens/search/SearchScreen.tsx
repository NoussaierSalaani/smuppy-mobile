import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
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
import { COLORS } from '../../config/theme';
import { AccountBadge } from '../../components/Badge';
import OptimizedImage from '../../components/OptimizedImage';
import SmuppyHeartIcon from '../../components/icons/SmuppyHeartIcon';
import { LiquidTabs } from '../../components/LiquidTabs';
import { resolveDisplayName } from '../../types/profile';
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

const PAGE_SIZE = 15;

// Smuppy URL patterns
const SMUPPY_URL_PATTERNS = {
  post: /(?:smuppy\.app|localhost)\/p\/([a-f0-9-]{36})/i,
  peak: /(?:smuppy\.app|localhost)\/peak\/([a-f0-9-]{36})/i,
  profile: /(?:smuppy\.app|localhost)\/u\/([a-zA-Z0-9_]+|[a-f0-9-]{36})/i,
};

// ============================================
// TYPES
// ============================================

type RootStackParamList = {
  UserProfile: { userId: string };
  PostDetailFanFeed: { postId: string; fanFeedPosts: any[] };
  PeakView: { peaks: any[]; initialIndex: number };
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
  const searchInputRef = useRef<TextInput>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<SearchTab>('all');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [linkDetected, setLinkDetected] = useState(false);

  // Results by type
  const [userResults, setUserResults] = useState<Profile[]>([]);
  const [postResults, setPostResults] = useState<Post[]>([]);
  const [peakResults, setPeakResults] = useState<Post[]>([]);
  const [hashtagResults, setHashtagResults] = useState<Post[]>([]);

  // Suggested content (when no search)
  const [suggestedProfiles, setSuggestedProfiles] = useState<Profile[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<{ tag: string; count: number }[]>([]);

  // Pagination
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load current user on mount
  useEffect(() => {
    const loadCurrentUser = async () => {
      const { data: currentProfile } = await getCurrentProfile();
      if (currentProfile) {
        setCurrentUserId(currentProfile.id);
      }
    };
    loadCurrentUser();
  }, []);

  // Detect Smuppy links and show content in results (not auto-navigate)
  const detectAndShowLinkContent = useCallback(async (query: string): Promise<boolean> => {
    setIsLoading(true);
    setHasSearched(true);

    // Check for post link
    const postMatch = query.match(SMUPPY_URL_PATTERNS.post);
    if (postMatch) {
      const postId = postMatch[1];
      const { data: post } = await getPostById(postId);
      if (post) {
        // Show in post results
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
      // Try by ID first (UUID format)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let profile = null;
      if (uuidRegex.test(usernameOrId)) {
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

    setIsLoading(false);
    return false;
  }, []);

  // Load suggested content
  const loadSuggestedContent = useCallback(async () => {
    setIsLoading(true);

    const [profilesRes, hashtagsRes] = await Promise.all([
      getSuggestedProfiles(PAGE_SIZE, 0),
      getTrendingHashtags(10),
    ]);

    if (profilesRes.data) {
      setSuggestedProfiles(profilesRes.data.filter(p => p.id !== currentUserId));
    }
    if (hashtagsRes.data) {
      setTrendingHashtags(hashtagsRes.data);
    }

    setIsLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId) {
      loadSuggestedContent();
    }
  }, [currentUserId, loadSuggestedContent]);

  // Perform search based on active tab
  const performSearch = useCallback(async (query: string, tabType: SearchTab, pageNum = 0, append = false) => {
    if (query.length < 2) {
      setUserResults([]);
      setPostResults([]);
      setPeakResults([]);
      setHashtagResults([]);
      setHasSearched(false);
      setPage(0);
      setHasMore(true);
      return;
    }

    if (pageNum > 0) {
      setLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setHasSearched(true);

    const offset = pageNum * PAGE_SIZE;

    // For "All" tab, search everything in parallel
    if (tabType === 'all') {
      const [usersRes, postsRes, peaksRes, tagsRes] = await Promise.all([
        searchProfiles(query, PAGE_SIZE, offset),
        searchPosts(query, PAGE_SIZE, offset),
        searchPeaks(query, PAGE_SIZE, offset),
        searchByHashtag(query, PAGE_SIZE, offset),
      ]);

      const users = (usersRes.data || []).filter(p => p.id !== currentUserId);
      const posts = postsRes.data || [];
      const peaks = peaksRes.data || [];
      const tags = tagsRes.data || [];

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

      // Has more if any category has more
      setHasMore(users.length >= PAGE_SIZE || posts.length >= PAGE_SIZE || peaks.length >= PAGE_SIZE || tags.length >= PAGE_SIZE);
      setIsLoading(false);
      setLoadingMore(false);
      return;
    }

    let newData: any[] = [];

    switch (tabType) {
      case 'users': {
        const { data } = await searchProfiles(query, PAGE_SIZE, offset);
        newData = (data || []).filter(p => p.id !== currentUserId);
        if (append) {
          setUserResults(prev => [...prev, ...newData]);
        } else {
          setUserResults(newData);
        }
        break;
      }
      case 'posts': {
        const { data } = await searchPosts(query, PAGE_SIZE, offset);
        newData = data || [];
        if (append) {
          setPostResults(prev => [...prev, ...newData]);
        } else {
          setPostResults(newData);
        }
        break;
      }
      case 'peaks': {
        const { data } = await searchPeaks(query, PAGE_SIZE, offset);
        newData = data || [];
        if (append) {
          setPeakResults(prev => [...prev, ...newData]);
        } else {
          setPeakResults(newData);
        }
        break;
      }
      case 'tags': {
        const { data } = await searchByHashtag(query, PAGE_SIZE, offset);
        newData = data || [];
        if (append) {
          setHashtagResults(prev => [...prev, ...newData]);
        } else {
          setHashtagResults(newData);
        }
        break;
      }
    }

    setHasMore(newData.length >= PAGE_SIZE);
    setIsLoading(false);
    setLoadingMore(false);
  }, [currentUserId]);

  // Debounce search input with link detection
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Don't re-search if link was already detected
    if (linkDetected) {
      return;
    }

    setPage(0);
    setHasMore(true);

    if (searchQuery.length > 0) {
      searchTimeoutRef.current = setTimeout(async () => {
        // First check if it's a Smuppy link
        const isLink = searchQuery.includes('smuppy.app') || searchQuery.includes('localhost');
        if (isLink) {
          const handled = await detectAndShowLinkContent(searchQuery);
          if (handled) {
            setLinkDetected(true);
            return;
          }
        }
        // If not a link or link not found, perform regular search
        performSearch(searchQuery, activeTab, 0, false);
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
  }, [searchQuery, performSearch, detectAndShowLinkContent]); // Removed activeTab from deps

  // Handle tab change separately (only for non-link searches)
  useEffect(() => {
    if (linkDetected || searchQuery.length < 2) return;

    // Check if it's a link - don't re-search
    const isLink = searchQuery.includes('smuppy.app') || searchQuery.includes('localhost');
    if (isLink) return;

    performSearch(searchQuery, activeTab, 0, false);
  }, [activeTab]); // Only trigger on tab change

  // Load more
  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || searchQuery.length < 2) return;
    const nextPage = page + 1;
    setPage(nextPage);
    performSearch(searchQuery, activeTab, nextPage, true);
  }, [loadingMore, hasMore, searchQuery, activeTab, page, performSearch]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleGoBack = (): void => {
    navigation.goBack();
  };

  const handleCancelSearch = (): void => {
    setSearchQuery('');
    Keyboard.dismiss();
  };

  const handleClearSearch = (): void => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const handleUserPress = (userId: string): void => {
    navigation.navigate('UserProfile', { userId });
  };

  const handlePostPress = (post: Post): void => {
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
  };

  const handlePeakPress = (peak: Post, index: number): void => {
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
    navigation.navigate('PeakView', { peaks: transformedPeaks, initialIndex: index });
  };

  const handleHashtagPress = (tag: string): void => {
    setSearchQuery(`#${tag}`);
    setActiveTab('tags');
  };

  // ============================================
  // RENDER ITEMS
  // ============================================

  const renderProfileItem = ({ item: profile }: { item: Profile }): React.JSX.Element => (
    <TouchableOpacity
      style={styles.resultItem}
      onPress={() => handleUserPress(profile.id)}
    >
      <Image
        source={{ uri: profile.avatar_url || DEFAULT_AVATAR }}
        style={styles.resultAvatar}
      />
      <View style={styles.resultInfo}>
        <View style={styles.usernameRow}>
          <Text style={styles.resultUsername}>{resolveDisplayName(profile)}</Text>
          <AccountBadge
            size={16}
            style={{ marginLeft: 4 }}
            isVerified={profile.is_verified}
            accountType={profile.account_type}
          />
        </View>
        <Text style={styles.resultFullName}>@{profile.username}</Text>
        {profile.fan_count !== undefined && profile.fan_count > 0 && (
          <Text style={styles.resultMutual}>{profile.fan_count} fans</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderPostItem = ({ item: post }: { item: Post }): React.JSX.Element => {
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
            <Ionicons name="image-outline" size={24} color={COLORS.grayMuted} />
          </View>
        )}
        {post.media_type === 'video' && (
          <View style={styles.videoIndicator}>
            <Ionicons name="play" size={12} color="#FFF" />
          </View>
        )}
        <View style={styles.gridStats}>
          <SmuppyHeartIcon size={12} color="#FFF" filled />
          <Text style={styles.gridStatText}>{post.likes_count || 0}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderPeakItem = ({ item: peak, index }: { item: Post; index: number }): React.JSX.Element => {
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
            <Ionicons name="videocam-outline" size={24} color={COLORS.grayMuted} />
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
  };

  const renderHashtagPost = ({ item: post }: { item: Post }): React.JSX.Element => {
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
            <Ionicons name="image-outline" size={24} color={COLORS.grayMuted} />
          </View>
        )}
        <View style={styles.gridStats}>
          <SmuppyHeartIcon size={12} color="#FFF" filled />
          <Text style={styles.gridStatText}>{post.likes_count || 0}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ============================================
  // RENDER TABS
  // ============================================

  const _getTabLabel = (tab: SearchTab): string => {
    switch (tab) {
      case 'all': return 'All';
      case 'users': return 'Users';
      case 'posts': return 'Posts';
      case 'peaks': return 'Peaks';
      case 'tags': return 'Tags';
    }
  };

  const _getTabCount = (tab: SearchTab): number => {
    switch (tab) {
      case 'all': return userResults.length + postResults.length + peakResults.length + hashtagResults.length;
      case 'users': return userResults.length;
      case 'posts': return postResults.length;
      case 'peaks': return peakResults.length;
      case 'tags': return hashtagResults.length;
    }
  };

  // Tabs configuration for LiquidTabs
  const searchTabs = [
    { key: 'all', label: 'All' },
    { key: 'users', label: 'Users' },
    { key: 'posts', label: 'Posts' },
    { key: 'peaks', label: 'Peaks' },
    { key: 'tags', label: 'Tags' },
  ];

  const handleTabChange = (key: string) => {
    const tab = key as SearchTab;
    setActiveTab(tab);
    if (searchQuery.length >= 2 && !hasSearched) {
      performSearch(searchQuery, tab, 0, false);
    }
  };

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

  const getCurrentResults = () => {
    switch (activeTab) {
      case 'users': return userResults;
      case 'posts': return postResults;
      case 'peaks': return peakResults;
      case 'tags': return hashtagResults;
      default: return [];
    }
  };

  const renderEmptyState = (): React.JSX.Element => (
    <View style={styles.emptyState}>
      <Ionicons name="search-outline" size={48} color={COLORS.grayMuted} />
      <Text style={styles.emptyText}>No results found</Text>
      <Text style={styles.emptySubtext}>Try a different search</Text>
    </View>
  );

  const renderSuggestedContent = (): React.JSX.Element => (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* Trending Hashtags */}
      {trendingHashtags.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trending Hashtags</Text>
          <View style={styles.hashtagsGrid}>
            {trendingHashtags.map((item, index) => (
              <TouchableOpacity
                key={`tag-${index}`}
                style={styles.hashtagChip}
                onPress={() => handleHashtagPress(item.tag)}
              >
                <Text style={styles.hashtagText}>#{item.tag}</Text>
                <Text style={styles.hashtagCount}>{item.count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Suggested Profiles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suggested</Text>
        {suggestedProfiles.map((profile) => (
          <TouchableOpacity
            key={profile.id}
            style={styles.resultItem}
            onPress={() => handleUserPress(profile.id)}
          >
            <Image
              source={{ uri: profile.avatar_url || DEFAULT_AVATAR }}
              style={styles.resultAvatar}
            />
            <View style={styles.resultInfo}>
              <View style={styles.usernameRow}>
                <Text style={styles.resultUsername}>{resolveDisplayName(profile)}</Text>
                <AccountBadge
                  size={16}
                  style={{ marginLeft: 4 }}
                  isVerified={profile.is_verified}
                  accountType={profile.account_type}
                />
              </View>
              <Text style={styles.resultFullName}>@{profile.username}</Text>
              {profile.fan_count !== undefined && profile.fan_count > 0 && (
                <Text style={styles.resultMutual}>{profile.fan_count} fans</Text>
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
            <Text style={styles.allSectionTitle}>Users</Text>
            {userResults.length > 3 && (
              <TouchableOpacity onPress={() => setActiveTab('users')}>
                <Text style={styles.seeAllText}>See all ({userResults.length})</Text>
              </TouchableOpacity>
            )}
          </View>
          {userResults.slice(0, 3).map((profile) => (
            <TouchableOpacity
              key={profile.id}
              style={styles.resultItem}
              onPress={() => handleUserPress(profile.id)}
            >
              <Image
                source={{ uri: profile.avatar_url || DEFAULT_AVATAR }}
                style={styles.resultAvatar}
              />
              <View style={styles.resultInfo}>
                <View style={styles.usernameRow}>
                  <Text style={styles.resultUsername}>{resolveDisplayName(profile)}</Text>
                  <AccountBadge
                    size={16}
                    style={{ marginLeft: 4 }}
                    isVerified={profile.is_verified}
                    accountType={profile.account_type}
                  />
                </View>
                <Text style={styles.resultFullName}>@{profile.username}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Posts Section */}
      {postResults.length > 0 && (
        <View style={styles.allSection}>
          <View style={styles.allSectionHeader}>
            <Text style={styles.allSectionTitle}>Posts</Text>
            {postResults.length > 6 && (
              <TouchableOpacity onPress={() => setActiveTab('posts')}>
                <Text style={styles.seeAllText}>See all ({postResults.length})</Text>
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
                    <OptimizedImage source={thumbnail} style={styles.allGridImage} />
                  ) : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder]}>
                      <Ionicons name="image-outline" size={20} color={COLORS.grayMuted} />
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
            <Text style={styles.allSectionTitle}>Peaks</Text>
            {peakResults.length > 6 && (
              <TouchableOpacity onPress={() => setActiveTab('peaks')}>
                <Text style={styles.seeAllText}>See all ({peakResults.length})</Text>
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
                    <OptimizedImage source={thumbnail} style={styles.allGridImage} />
                  ) : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder]}>
                      <Ionicons name="videocam-outline" size={20} color={COLORS.grayMuted} />
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
            <Text style={styles.allSectionTitle}>Tagged Posts</Text>
            {hashtagResults.length > 6 && (
              <TouchableOpacity onPress={() => setActiveTab('tags')}>
                <Text style={styles.seeAllText}>See all ({hashtagResults.length})</Text>
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
                    <OptimizedImage source={thumbnail} style={styles.allGridImage} />
                  ) : (
                    <View style={[styles.allGridImage, styles.gridPlaceholder]}>
                      <Ionicons name="image-outline" size={20} color={COLORS.grayMuted} />
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
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}
    </ScrollView>
  );

  const renderSearchResults = (): React.JSX.Element => {
    const results = getCurrentResults();

    if (isLoading && !loadingMore) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Searching...</Text>
        </View>
      );
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
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMore}>
                <ActivityIndicator size="small" color={COLORS.primary} />
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
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMore}>
              <ActivityIndicator size="small" color={COLORS.primary} />
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
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>

        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color={COLORS.grayMuted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder={activeTab === 'tags' ? 'Search #hashtags...' : 'Search...'}
            placeholderTextColor={COLORS.grayMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoFocus={true}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch}>
              <Ionicons name="close-circle" size={20} color={COLORS.grayMuted} />
            </TouchableOpacity>
          )}
        </View>

        {searchQuery.length > 0 && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelSearch}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      {renderTabs()}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
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
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.dark,
  },
  cancelButton: {
    paddingHorizontal: 4,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.primary,
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
    color: COLORS.dark,
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
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  hashtagText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.dark,
  },
  hashtagCount: {
    fontSize: 12,
    color: COLORS.gray,
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
  resultUsername: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.dark,
  },
  resultFullName: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 1,
  },
  resultMutual: {
    fontSize: 12,
    color: COLORS.primary,
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
    color: COLORS.dark,
  },
  seeAllText: {
    fontSize: 14,
    color: COLORS.primary,
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
    backgroundColor: '#F0F0F0',
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
    backgroundColor: '#F0F0F0',
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
    color: COLORS.dark,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.grayMuted,
    marginTop: 4,
  },

  // Loading
  loadingContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 12,
  },
  loadingMore: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});

export default SearchScreen;
