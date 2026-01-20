import React, { useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import PeakProgressRing from './PeakProgressRing';

const { width } = Dimensions.get('window');
const ITEM_SIZE = 66;
const ITEM_SPACING = 12;
const ACTIVE_ITEM_SIZE = 76;

const COLORS = {
  primary: '#0EBF8A',
  dark: '#0A0A0F',
};

const PeakCarousel = ({
  peaks,
  currentIndex,
  onPeakSelect,
  currentPeakDuration,
  isPaused,
  onPeakComplete,
  visible = true,
}) => {
  const scrollViewRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Animation de fade in/out
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  // Auto-scroll vers l'élément actif
  useEffect(() => {
    if (scrollViewRef.current && peaks.length > 0) {
      const scrollX = currentIndex * (ITEM_SIZE + ITEM_SPACING) - (width / 2) + (ACTIVE_ITEM_SIZE / 2);
      scrollViewRef.current.scrollTo({
        x: Math.max(0, scrollX),
        animated: true,
      });
    }
  }, [currentIndex]);

  if (!visible && fadeAnim._value === 0) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        decelerationRate="fast"
        snapToInterval={ITEM_SIZE + ITEM_SPACING}
      >
        {peaks.map((peak, index) => {
          const isActive = index === currentIndex;
          
          return (
            <TouchableOpacity
              key={peak.id}
              style={[
                styles.itemContainer,
                isActive && styles.activeItemContainer,
              ]}
              onPress={() => onPeakSelect(index)}
              activeOpacity={0.8}
            >
              <PeakProgressRing
                size={isActive ? ACTIVE_ITEM_SIZE : ITEM_SIZE}
                strokeWidth={isActive ? 3 : 2}
                avatar={peak.user.avatar}
                isActive={isActive}
                duration={currentPeakDuration}
                isPaused={isPaused}
                onComplete={onPeakComplete}
              />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingBottom: 20,
    zIndex: 100,
  },
  scrollContent: {
    paddingHorizontal: (width - ACTIVE_ITEM_SIZE) / 2,
    alignItems: 'center',
  },
  itemContainer: {
    marginHorizontal: ITEM_SPACING / 2,
    opacity: 0.7,
  },
  activeItemContainer: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
});

export default PeakCarousel;