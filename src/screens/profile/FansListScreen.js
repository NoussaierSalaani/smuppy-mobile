import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  StatusBar,
  Modal,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DARK_COLORS as COLORS } from '../../config/theme';

// Sample fans data
// isFanOfMe = true → this person follows me
// iAmFanOf = true → I follow this person
// unfollowedAt = date when I unfollowed (for 7-day block)
const SAMPLE_FANS = [
  { id: '1', name: 'Hannah Smith', username: '@hannahsmith', avatar: 'https://i.pravatar.cc/100?img=1', isVerified: true, isFanOfMe: true, iAmFanOf: false, unfollowedAt: null },
  { id: '2', name: 'Thomas Lefèvre', username: '@thomaslef', avatar: 'https://i.pravatar.cc/100?img=3', isVerified: false, isFanOfMe: true, iAmFanOf: true, unfollowedAt: null },
  { id: '3', name: 'Mariam Fiori', username: '@mariamfiori', avatar: 'https://i.pravatar.cc/100?img=5', isVerified: true, isFanOfMe: true, iAmFanOf: false, unfollowedAt: null },
  { id: '4', name: 'Alex Runner', username: '@alexrunner', avatar: 'https://i.pravatar.cc/100?img=8', isVerified: false, isFanOfMe: false, iAmFanOf: true, unfollowedAt: null },
  { id: '5', name: 'FitCoach Pro', username: '@fitcoachpro', avatar: 'https://i.pravatar.cc/100?img=12', isVerified: true, isFanOfMe: true, iAmFanOf: true, unfollowedAt: null },
  { id: '6', name: 'Sarah Johnson', username: '@sarahj', avatar: 'https://i.pravatar.cc/100?img=9', isVerified: false, isFanOfMe: true, iAmFanOf: false, unfollowedAt: null },
  { id: '7', name: 'Mike Chen', username: '@mikechen', avatar: 'https://i.pravatar.cc/100?img=11', isVerified: true, isFanOfMe: false, iAmFanOf: true, unfollowedAt: null },
  { id: '8', name: 'David Kim', username: '@davidkim', avatar: 'https://i.pravatar.cc/100?img=14', isVerified: false, isFanOfMe: true, iAmFanOf: true, unfollowedAt: null },
];

export default function FansListScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const fansCount = route?.params?.fansCount || 787;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState(SAMPLE_FANS);
  const [showUnfollowPopup, setShowUnfollowPopup] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // Filter to show only users with a relationship (they follow me OR I follow them)
  const fansWithRelationship = allUsers.filter(user => user.isFanOfMe || user.iAmFanOf);

  // Filter based on search
  const filteredFans = fansWithRelationship.filter(fan => 
    fan.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    fan.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Check if 7 days have passed since unfollow
  const canRefollow = (unfollowedAt) => {
    if (!unfollowedAt) return true;
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - unfollowedAt) >= sevenDaysInMs;
  };

  // Get days remaining before can refollow
  const getDaysRemaining = (unfollowedAt) => {
    if (!unfollowedAt) return 0;
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
    const timePassed = Date.now() - unfollowedAt;
    const timeRemaining = sevenDaysInMs - timePassed;
    return Math.ceil(timeRemaining / (24 * 60 * 60 * 1000));
  };

  // Handle Track tap → become a fan (with 7-day check)
  const handleBecomeFan = (userId) => {
    const user = allUsers.find(u => u.id === userId);
    
    if (user && !canRefollow(user.unfollowedAt)) {
      const daysRemaining = getDaysRemaining(user.unfollowedAt);
      Alert.alert(
        'Cannot follow yet',
        `You need to wait ${daysRemaining} more day${daysRemaining > 1 ? 's' : ''} before you can follow ${user.name} again.`,
        [{ text: 'OK' }]
      );
      return;
    }
    
    setAllUsers(allUsers.map(u => 
      u.id === userId ? { ...u, iAmFanOf: true, unfollowedAt: null } : u
    ));
  };

  // Handle Fan badge tap → show unfollow popup
  const handleFanPress = (user) => {
    setSelectedUser(user);
    setShowUnfollowPopup(true);
  };

  // Handle unfollow confirmation
  const handleUnfollow = () => {
    if (selectedUser) {
      setAllUsers(allUsers.map(user => 
        user.id === selectedUser.id 
          ? { ...user, iAmFanOf: false, unfollowedAt: Date.now() } 
          : user
      ));
    }
    setShowUnfollowPopup(false);
    setSelectedUser(null);
  };

  // Close popup
  const closePopup = () => {
    setShowUnfollowPopup(false);
    setSelectedUser(null);
  };

  // Render badge based on relationship
  const renderBadge = (item) => {
    const isMutual = item.isFanOfMe && item.iAmFanOf;
    
    // Mutuel → Pas de badge (on est fan l'un de l'autre)
    if (isMutual) {
      return null;
    }
    
    // Elle me suit mais je ne la suis pas → Track badge (VERT plein)
    if (item.isFanOfMe && !item.iAmFanOf) {
      return (
        <TouchableOpacity
          style={styles.trackBadge}
          onPress={() => handleBecomeFan(item.id)}
        >
          <Ionicons name="add" size={14} color={COLORS.dark} />
          <Text style={styles.trackBadgeText}>Track</Text>
        </TouchableOpacity>
      );
    }
    
    // Je suis cette personne mais elle ne me suit pas → Fan badge (outline vert)
    if (item.iAmFanOf && !item.isFanOfMe) {
      return (
        <TouchableOpacity
          style={styles.fanBadge}
          onPress={() => handleFanPress(item)}
        >
          <Ionicons name="heart" size={12} color={COLORS.primary} />
          <Text style={styles.fanBadgeText}>Fan</Text>
        </TouchableOpacity>
      );
    }

    return null;
  };

  // Render fan item
  const renderFanItem = ({ item }) => {
    const isMutual = item.isFanOfMe && item.iAmFanOf;
    
    return (
      <TouchableOpacity 
        style={styles.fanItem}
        onPress={() => navigation.navigate('UserProfile', { userId: item.id })}
        activeOpacity={0.7}
      >
        <Image source={{ uri: item.avatar }} style={styles.avatar} />
        
        <View style={styles.fanInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.fanName}>{item.name}</Text>
            {item.isVerified && (
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            )}
          </View>
          <Text style={styles.fanUsername}>{item.username}</Text>
        </View>

        {renderBadge(item)}
      </TouchableOpacity>
    );
  };

  // Unfollow Popup Modal
  const renderUnfollowPopup = () => (
    <Modal
      visible={showUnfollowPopup}
      transparent
      animationType="fade"
      onRequestClose={closePopup}
    >
      <TouchableWithoutFeedback onPress={closePopup}>
        <View style={styles.popupOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.popupContainer}>
              {selectedUser && (
                <>
                  <Image source={{ uri: selectedUser.avatar }} style={styles.popupAvatar} />
                  <Text style={styles.popupName}>{selectedUser.name}</Text>
                  <Text style={styles.popupUsername}>{selectedUser.username}</Text>
                  
                  <Text style={styles.popupWarning}>
                    You won't be able to follow again for 7 days
                  </Text>
                  
                  <TouchableOpacity
                    style={styles.unfollowButton}
                    onPress={handleUnfollow}
                  >
                    <Ionicons name="heart-dislike-outline" size={18} color={COLORS.red} />
                    <Text style={styles.unfollowButtonText}>Unfollow</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        
        <View style={styles.headerTitle}>
          <Text style={styles.headerText}>Fans</Text>
          <Text style={styles.fansCount}>{fansCount}</Text>
        </View>
        
        <View style={{ width: 40 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={COLORS.gray} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search..."
            placeholderTextColor={COLORS.gray}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={COLORS.gray} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Fans List */}
      <FlatList
        data={filteredFans}
        renderItem={renderFanItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={60} color={COLORS.gray} />
            <Text style={styles.emptyText}>No fans yet</Text>
          </View>
        }
      />

      {/* Unfollow Popup */}
      {renderUnfollowPopup()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    alignItems: 'center',
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  fansCount: {
    fontSize: 14,
    color: COLORS.primary,
    marginTop: 2,
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.white,
    marginLeft: 10,
  },

  // List
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },

  // Fan Item
  fanItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  fanInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fanName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  fanUsername: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 2,
  },

  // Track Badge - VERT PLEIN (comme FanFeed suggestions)
  trackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  trackBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.dark,
    marginLeft: 2,
  },

  // Fan Badge - Outline vert avec coeur
  fanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 227, 163, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  fanBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 4,
  },

  // Popup
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  popupContainer: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '80%',
    maxWidth: 300,
  },
  popupAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginBottom: 12,
  },
  popupName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 4,
  },
  popupUsername: {
    fontSize: 14,
    color: COLORS.gray,
    marginBottom: 12,
  },
  popupWarning: {
    fontSize: 12,
    color: COLORS.red,
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.8,
  },
  unfollowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  unfollowButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.red,
    marginLeft: 8,
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.gray,
    marginTop: 16,
  },
});