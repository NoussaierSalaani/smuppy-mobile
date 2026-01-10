import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Keyboard,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../config/theme';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 40) / 2;

// ============================================
// MOCK DATA
// ============================================

const EXPLORE_POSTS = [
  {
    id: '1',
    image: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400',
    title: 'Start At Zero',
    user: { id: '1', name: 'Dianne Rus...', avatar: 'https://randomuser.me/api/portraits/women/1.jpg' },
    likes: 1234,
    isLive: true,
    height: 220,
  },
  {
    id: '2',
    image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400',
    title: 'This Full-Body Home Workout Will Leave You Sw...',
    user: { id: '2', name: 'Dianne Rus...', avatar: 'https://randomuser.me/api/portraits/women/2.jpg' },
    likes: 1234,
    duration: '0:15',
    height: 280,
  },
  {
    id: '3',
    image: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=400',
    title: 'This Full-Body Home Workout Will Leave You Sw...',
    user: { id: '3', name: 'Dianne Rus...', avatar: 'https://randomuser.me/api/portraits/women/3.jpg' },
    likes: 1234,
    duration: '0:34',
    height: 180,
  },
  {
    id: '4',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400',
    title: 'This Full-Body Home Workout Will Leave You Sw...',
    user: { id: '4', name: 'Dianne Rus...', avatar: 'https://randomuser.me/api/portraits/men/1.jpg' },
    likes: 1234,
    height: 240,
  },
  {
    id: '5',
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400',
    title: 'This Full-Body Home Workout Will Leave You Sw...',
    user: { id: '5', name: 'Dianne Rus...', avatar: 'https://randomuser.me/api/portraits/women/4.jpg' },
    likes: 1234,
    duration: '0:34',
    height: 200,
  },
  {
    id: '6',
    image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=400',
    title: 'This Full-Body Home Workout Will Leave You Sw...',
    user: { id: '6', name: 'Dianne Rus...', avatar: 'https://randomuser.me/api/portraits/women/5.jpg' },
    likes: 1234,
    height: 260,
  },
];

const RECENT_SEARCHES = [
  {
    id: '1',
    name: 'ma.fiori',
    fullName: 'Mariem Fiori',
    avatar: 'https://randomuser.me/api/portraits/women/10.jpg',
    subtitle: '3 new posts',
  },
  {
    id: '2',
    name: 'darlene.robert',
    fullName: 'Darlene Robertson',
    avatar: 'https://randomuser.me/api/portraits/women/11.jpg',
    subtitle: '1 new post',
  },
];

const ALL_USERS = [
  {
    id: '1',
    username: 'ma.fiori',
    fullName: 'Mariem Fiori',
    avatar: 'https://randomuser.me/api/portraits/women/10.jpg',
    mutualFans: 0,
  },
  {
    id: '2',
    username: 'oxygene.fitness',
    fullName: 'Oxygene Fitness & Sport',
    avatar: 'https://randomuser.me/api/portraits/women/12.jpg',
    mutualFans: 12,
  },
  {
    id: '3',
    username: 'fitness.montreal',
    fullName: 'Fitness Montréal',
    avatar: 'https://randomuser.me/api/portraits/men/10.jpg',
    mutualFans: 5,
  },
  {
    id: '4',
    username: 'darlene.robert',
    fullName: 'Darlene Robertson',
    avatar: 'https://randomuser.me/api/portraits/women/11.jpg',
    mutualFans: 0,
  },
  {
    id: '5',
    username: 'first.fitness.ottawa',
    fullName: 'First Fitness Ottawa',
    avatar: 'https://randomuser.me/api/portraits/men/11.jpg',
    mutualFans: 3,
  },
];

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'users', label: 'Users', count: 3 },
  { key: 'places', label: 'Places', count: 2 },
  { key: 'posts', label: 'Posts', count: 1 },
  { key: 'hashtags', label: 'Hashtags' },
];

// ============================================
// COMPOSANT PRINCIPAL
// ============================================

const SearchScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const searchInputRef = useRef(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchResults, setSearchResults] = useState([]);

  // Filtrer les résultats
  useEffect(() => {
    if (searchQuery.length > 0) {
      const filtered = ALL_USERS.filter(user => 
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.fullName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(filtered);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // ============================================
  // FONCTIONS
  // ============================================

  const handleGoBack = () => {
    navigation.goBack();
  };

  const handleSearchFocus = () => {
    setIsSearchFocused(true);
  };

  const handleCancelSearch = () => {
    setSearchQuery('');
    setIsSearchFocused(false);
    setActiveFilter('all');
    Keyboard.dismiss();
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    searchInputRef.current?.focus();
  };

  const handleUserPress = (user) => {
    navigation.navigate('UserProfile', { userId: user.id });
  };

  const handlePostPress = (post) => {
    console.log('Open post:', post.id);
  };

  const handleRemoveRecentSearch = (id) => {
    console.log('Remove:', id);
  };

  // Séparer les posts en 2 colonnes pour effet Pinterest
  const getColumns = () => {
    const leftColumn = [];
    const rightColumn = [];
    
    EXPLORE_POSTS.forEach((post, index) => {
      if (index % 2 === 0) {
        leftColumn.push(post);
      } else {
        rightColumn.push(post);
      }
    });
    
    return { leftColumn, rightColumn };
  };

  const { leftColumn, rightColumn } = getColumns();

  // ============================================
  // RENDER CARD PINTEREST
  // ============================================

  const renderPinterestCard = (item) => (
    <TouchableOpacity 
      key={item.id}
      style={[styles.pinterestCard, { height: item.height + 80 }]}
      onPress={() => handlePostPress(item)}
      activeOpacity={0.9}
    >
      <Image 
        source={{ uri: item.image }} 
        style={[styles.pinterestImage, { height: item.height }]} 
      />
      
      {/* Badge LIVE */}
      {item.isLive && (
        <View style={styles.liveBadge}>
          <Text style={styles.liveBadgeText}>LIVE</Text>
        </View>
      )}
      
      {/* Durée vidéo */}
      {item.duration && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{item.duration}</Text>
        </View>
      )}
      
      {/* Info en bas */}
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <TouchableOpacity 
          style={styles.cardMeta}
          onPress={() => handleUserPress(item.user)}
        >
          <Image source={{ uri: item.user.avatar }} style={styles.cardAvatar} />
          <Text style={styles.cardUsername} numberOfLines={1}>{item.user.name}</Text>
          <Ionicons name="heart-outline" size={14} color={COLORS.gray} />
          <Text style={styles.cardLikes}>{item.likes}</Text>
        </TouchableOpacity>
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
        
        <View style={[
          styles.searchInputContainer,
          isSearchFocused && styles.searchInputFocused
        ]}>
          <Ionicons name="search" size={20} color={COLORS.grayMuted} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor={COLORS.grayMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onFocus={handleSearchFocus}
            returnKeyType="search"
            autoFocus={true}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch}>
              <Ionicons name="close-circle" size={20} color={COLORS.grayMuted} />
            </TouchableOpacity>
          )}
        </View>

        {isSearchFocused && searchQuery.length > 0 && (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancelSearch}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ============ FILTRES ============ */}
      {isSearchFocused && searchQuery.length > 0 && (
        <View style={styles.filtersWrapper}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filtersContent}
          >
            {FILTER_TABS.map((tab) => (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.filterTab,
                  activeFilter === tab.key && styles.filterTabActive
                ]}
                onPress={() => setActiveFilter(tab.key)}
              >
                <Text style={[
                  styles.filterTabText,
                  activeFilter === tab.key && styles.filterTabTextActive
                ]}>
                  {tab.label}{tab.count ? ` (${tab.count})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* ============ CONTENU ============ */}
      
      {/* ÉTAT 1: Feed Pinterest (pas de recherche active) */}
      {!isSearchFocused && (
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.pinterestContainer}
        >
          <View style={styles.pinterestGrid}>
            <View style={styles.pinterestColumn}>
              {leftColumn.map(renderPinterestCard)}
            </View>
            <View style={styles.pinterestColumn}>
              {rightColumn.map(renderPinterestCard)}
            </View>
          </View>
        </ScrollView>
      )}

      {/* ÉTAT 2: Recherches récentes (focus mais pas de texte) */}
      {isSearchFocused && searchQuery.length === 0 && (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {RECENT_SEARCHES.map((item) => (
            <View key={item.id} style={styles.recentItem}>
              <TouchableOpacity 
                style={styles.recentContent}
                onPress={() => handleUserPress(item)}
              >
                <Image source={{ uri: item.avatar }} style={styles.recentAvatar} />
                <View style={styles.recentInfo}>
                  <Text style={styles.recentName}>{item.name}</Text>
                  <Text style={styles.recentSubtitle}>{item.fullName}</Text>
                  {item.subtitle && (
                    <Text style={styles.recentNewPosts}>{item.subtitle}</Text>
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleRemoveRecentSearch(item.id)}>
                <Ionicons name="close" size={20} color={COLORS.grayMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {/* ÉTAT 3: Résultats de recherche */}
      {isSearchFocused && searchQuery.length > 0 && (
        <ScrollView showsVerticalScrollIndicator={false}>
          {searchResults.length > 0 ? (
            searchResults.map((item) => (
              <TouchableOpacity 
                key={item.id}
                style={styles.resultItem}
                onPress={() => handleUserPress(item)}
              >
                <Image source={{ uri: item.avatar }} style={styles.resultAvatar} />
                <View style={styles.resultInfo}>
                  <Text style={styles.resultUsername}>{item.username}</Text>
                  <Text style={styles.resultFullName}>{item.fullName}</Text>
                  {item.mutualFans > 0 && (
                    <Text style={styles.resultMutual}>{item.mutualFans} mutual fans</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={COLORS.grayMuted} />
              <Text style={styles.emptyText}>No results found</Text>
              <Text style={styles.emptySubtext}>Try a different search</Text>
            </View>
          )}
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
});

export default SearchScreen;