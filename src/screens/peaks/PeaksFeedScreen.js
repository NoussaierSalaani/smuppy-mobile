import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import PeakCard from '../../components/peaks/PeakCard';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 48) / 2;

const COLORS = {
  primary: '#11E3A3',
  dark: '#0A0A0F',
  white: '#FFFFFF',
  gray: '#8E8E93',
  cardBg: '#1C1C1E',
};

// Mock data pour les Peaks
const MOCK_PEAKS = [
  {
    id: '1',
    thumbnail: 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400',
    duration: 10,
    user: {
      id: 'user1',
      name: 'Sarah Fit',
      avatar: 'https://i.pravatar.cc/100?img=1',
    },
    views: 12500,
    reactions: 890,
    repliesCount: 5,
    createdAt: new Date(),
  },
  {
    id: '2',
    thumbnail: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400',
    duration: 6,
    user: {
      id: 'user2',
      name: 'Mike Strong',
      avatar: 'https://i.pravatar.cc/100?img=12',
    },
    views: 8700,
    reactions: 432,
    repliesCount: 0,
    createdAt: new Date(),
  },
  {
    id: '3',
    thumbnail: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=400',
    duration: 15,
    user: {
      id: 'user3',
      name: 'Emma Yoga',
      avatar: 'https://i.pravatar.cc/100?img=5',
    },
    views: 23400,
    reactions: 1567,
    repliesCount: 12,
    createdAt: new Date(),
  },
  {
    id: '4',
    thumbnail: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=400',
    duration: 10,
    user: {
      id: 'user4',
      name: 'John Gym',
      avatar: 'https://i.pravatar.cc/100?img=8',
    },
    views: 5600,
    reactions: 234,
    repliesCount: 3,
    createdAt: new Date(),
  },
  {
    id: '5',
    thumbnail: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400',
    duration: 6,
    user: {
      id: 'user5',
      name: 'Lisa Run',
      avatar: 'https://i.pravatar.cc/100?img=9',
    },
    views: 15800,
    reactions: 876,
    repliesCount: 8,
    createdAt: new Date(),
  },
  {
    id: '6',
    thumbnail: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400',
    duration: 15,
    user: {
      id: 'user6',
      name: 'Alex CrossFit',
      avatar: 'https://i.pravatar.cc/100?img=11',
    },
    views: 34200,
    reactions: 2341,
    repliesCount: 25,
    createdAt: new Date(),
  },
];

const PeaksFeedScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [refreshing, setRefreshing] = useState(false);
  const [peaks, setPeaks] = useState(MOCK_PEAKS);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  }, []);

  const handlePeakPress = (peak) => {
    const index = peaks.findIndex(p => p.id === peak.id);
    navigation.navigate('PeakView', { 
      peaks: peaks,
      initialIndex: index,
    });
  };

  const handleCreatePeak = () => {
    navigation.navigate('CreatePeak');
  };

  const handleGoBack = () => {
    navigation.goBack();
  };

  const getColumns = () => {
    const leftColumn = [];
    const rightColumn = [];
    
    peaks.forEach((peak, index) => {
      if (index % 2 === 0) {
        leftColumn.push(peak);
      } else {
        rightColumn.push(peak);
      }
    });
    
    return { leftColumn, rightColumn };
  };

  const { leftColumn, rightColumn } = getColumns();

  const renderColumn = (columnPeaks) => (
    <View style={styles.column}>
      {columnPeaks.map((peak) => (
        <PeakCard
          key={peak.id}
          peak={peak}
          onPress={handlePeakPress}
        />
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={handleGoBack}
        >
          <Ionicons name="chevron-back" size={28} color={COLORS.white} />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>Peaks</Text>

        <TouchableOpacity 
          style={styles.createButton}
          onPress={handleCreatePeak}
        >
          <Ionicons name="add" size={28} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Grid */}
      <FlatList
        data={[1]}
        keyExtractor={() => 'grid'}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
        contentContainerStyle={styles.gridContainer}
        renderItem={() => (
          <View style={styles.masonryContainer}>
            {renderColumn(leftColumn)}
            {renderColumn(rightColumn)}
          </View>
        )}
        ListFooterComponent={<View style={{ height: 100 }} />}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
  },
  createButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    paddingHorizontal: 16,
  },
  masonryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  column: {
    width: COLUMN_WIDTH,
  },
});

export default PeaksFeedScreen;