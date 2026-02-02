// src/components/OfflineBanner.tsx
// Displays a banner when the app is offline
import React, { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../stores';

interface OfflineBannerProps {
  onRetry?: () => void;
}

/**
 * OfflineBanner - Shows when the app loses network connectivity
 * Automatically appears/disappears based on network status
 * Memoized for performance
 */
const OfflineBanner = memo(function OfflineBanner({ onRetry }: OfflineBannerProps) {
  const insets = useSafeAreaInsets();
  const isOnline = useAppStore((state) => state.isOnline);
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      // Slide in when offline
      wasOffline.current = true;
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    } else if (wasOffline.current) {
      // Slide out when back online (after being offline)
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        wasOffline.current = false;
      });
    }
  }, [isOnline, slideAnim]);

  // Don't render if always online
  if (isOnline && !wasOffline.current) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 8,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons
            name={isOnline ? "checkmark-circle" : "cloud-offline"}
            size={20}
            color="white"
          />
        </View>
        <Text style={styles.text}>
          {isOnline ? "Back online!" : "No internet connection"}
        </Text>
        {!isOnline && onRetry && (
          <TouchableOpacity onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
});

export default OfflineBanner;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF6B6B',
    zIndex: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  retryText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});
