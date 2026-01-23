import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  StatusBar,
  ActivityIndicator,
  Keyboard,
  Dimensions,
} from 'react-native';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { COLORS } from '../../config/theme';
import { VerifiedBadge } from '../../components/Badge';
import { searchProfiles, getSuggestedProfiles, Profile, getCurrentProfile } from '../../services/database';

// ============================================
// TYPES
// ============================================

type RootStackParamList = {
  UserProfile: { userId: string };
  [key: string]: object | undefined;
};

// ============================================
// DEFAULT AVATAR
// ============================================
const DEFAULT_AVATAR = 'https://via.placeholder.com/100/0EBF8A/FFFFFF?text=S';

// ============================================
// MAIN COMPONENT
// ============================================

const SearchScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const searchInputRef = useRef<TextInput>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [suggestedProfiles, setSuggestedProfiles] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Load current user and suggested profiles on mount
  useEffect(() => {
    const loadData = async () => {
      // Get current user to exclude from results
      const { data: currentProfile } = await getCurrentProfile();
      if (currentProfile) {
        setCurrentUserId(currentProfile.id);
      }

      // Get suggested profiles (excluding current user)
      const { data } = await getSuggestedProfiles(10);
      if (data) {
        const filtered = data.filter(p => p.id !== currentProfile?.id);
        setSuggestedProfiles(filtered);
      }
    };
    loadData();
  }, []);

  // Debounced search - real API call
  const performSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsLoading(true);
    setHasSearched(true);

    const { data, error } = await searchProfiles(query, 20);

    if (error) {
      console.error('[SearchScreen] Search error:', error);
    }

    // Filter out current user from search results
    const filtered = (data || []).filter(p => p.id !== currentUserId);
    setSearchResults(filtered);
    setIsLoading(false);
  }, [currentUserId]);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (searchQuery.length > 0) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(searchQuery);
      }, 300);
    } else {
      setSearchResults([]);
      setHasSearched(false);
    }

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  // ============================================
  // FUNCTIONS
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

  // ============================================
  // RENDER PROFILE ITEM
  // ============================================

  const renderProfileItem = (profile: Profile): React.JSX.Element => (
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
          <Text style={styles.resultUsername}>@{profile.username}</Text>
          {profile.is_verified && (
            <VerifiedBadge size={16} style={{ marginLeft: 4 }} />
          )}
        </View>
        <Text style={styles.resultFullName}>{profile.full_name}</Text>
        {profile.fan_count !== undefined && profile.fan_count > 0 && (
          <Text style={styles.resultMutual}>{profile.fan_count} fans</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* ============ HEADER AVEC FLÈCHE RETOUR ============ */}
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
            placeholder="Search users..."
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

      {/* ============ CONTENU ============ */}

      {/* ÉTAT 1: Suggested profiles (no search query) */}
      {searchQuery.length === 0 && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Suggested</Text>
          {suggestedProfiles.length > 0 ? (
            suggestedProfiles.map(renderProfileItem)
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={COLORS.primary} />
            </View>
          )}
        </ScrollView>
      )}

      {/* ÉTAT 2: Search results */}
      {searchQuery.length > 0 && (
        <ScrollView showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Searching...</Text>
            </View>
          ) : searchResults.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Results ({searchResults.length})</Text>
              {searchResults.map(renderProfileItem)}
            </>
          ) : hasSearched ? (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={COLORS.grayMuted} />
              <Text style={styles.emptyText}>No results found</Text>
              <Text style={styles.emptySubtext}>Try a different search</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
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
  searchInputFocused: {
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
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

  // Section Title
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },

  // Filters
  filtersWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
    paddingBottom: 12,
  },
  filtersContent: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  filterTabActive: {
    backgroundColor: COLORS.dark,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray,
  },
  filterTabTextActive: {
    color: COLORS.white,
  },

  // Pinterest Grid
  pinterestContainer: {
    padding: 12,
  },
  pinterestGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pinterestColumn: {
    width: COLUMN_WIDTH,
  },
  pinterestCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  pinterestImage: {
    width: '100%',
    backgroundColor: '#F0F0F0',
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  durationBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: COLORS.white,
    fontSize: 11,
    fontWeight: '500',
  },
  cardInfo: {
    padding: 10,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 8,
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  cardUsername: {
    flex: 1,
    fontSize: 12,
    color: COLORS.gray,
  },
  cardLikes: {
    fontSize: 12,
    color: COLORS.gray,
    marginLeft: 4,
  },

  // Recent Searches
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recentContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  recentAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  recentInfo: {
    flex: 1,
  },
  recentName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.dark,
  },
  recentSubtitle: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },
  recentNewPosts: {
    fontSize: 12,
    color: COLORS.primary,
    marginTop: 2,
  },

  // Search Results
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

  // Username row with verification badge
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default SearchScreen;
