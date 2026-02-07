/**
 * ExpiredPeakModal — Full-screen modal for expired peak decisions.
 * User must choose: save to profile, download, or dismiss for each expired peak.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import OptimizedImage from '../OptimizedImage';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import type { Peak } from '../../services/aws-api';

const { width } = Dimensions.get('window');

interface ExpiredPeakModalProps {
  visible: boolean;
  peaks: Peak[];
  onSaveToProfile: (peakId: string) => Promise<void>;
  onDownload: (peakId: string, videoUrl: string) => Promise<boolean>;
  onDismiss: (peakId: string) => Promise<void>;
  onAllDone: () => void;
}

const ExpiredPeakModal: React.FC<ExpiredPeakModalProps> = ({
  visible,
  peaks,
  onSaveToProfile,
  onDownload,
  onDismiss,
  onAllDone,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);

  const currentPeak = peaks[currentIdx];
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleAction = useCallback(async (action: 'save' | 'download' | 'dismiss') => {
    if (!currentPeak || loading) return;
    setLoading(action);
    try {
      if (action === 'save') {
        await onSaveToProfile(currentPeak.id);
      } else if (action === 'download') {
        const videoUrl = currentPeak.videoUrl;
        if (videoUrl) {
          await onDownload(currentPeak.id, videoUrl);
        }
        await onDismiss(currentPeak.id);
      } else {
        await onDismiss(currentPeak.id);
      }

      // Move to next peak or finish
      if (peaks.length <= 1) {
        onAllDone();
      } else if (currentIdx >= peaks.length - 1) {
        setCurrentIdx(0);
      }
    } catch (error) {
      if (__DEV__) console.warn('[ExpiredPeakModal] Action failed:', error);
    } finally {
      setLoading(null);
    }
  }, [currentPeak, currentIdx, peaks.length, loading, onSaveToProfile, onDownload, onDismiss, onAllDone]);

  if (!currentPeak) return null;

  const thumbnailUrl = currentPeak.thumbnailUrl || undefined;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Background thumbnail (dimmed) */}
        {thumbnailUrl && (
          <OptimizedImage
            source={{ uri: thumbnailUrl }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={styles.dimOverlay} />

        <View style={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
          {/* Counter */}
          {peaks.length > 1 && (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {currentIdx + 1} of {peaks.length}
              </Text>
            </View>
          )}

          {/* Title */}
          <Text style={styles.title}>Your peak has expired!</Text>
          {currentPeak.caption && (
            <Text style={styles.caption} numberOfLines={2}>
              {currentPeak.caption}
            </Text>
          )}

          {/* Thumbnail preview */}
          <View style={styles.thumbnailContainer}>
            {thumbnailUrl ? (
              <OptimizedImage
                source={{ uri: thumbnailUrl }}
                style={styles.thumbnail}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>
                <Ionicons name="videocam-outline" size={48} color="rgba(255,255,255,0.3)" />
              </View>
            )}
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="heart" size={16} color="#FF375F" />
              <Text style={styles.statText}>{currentPeak.likesCount}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="chatbubble" size={16} color="rgba(255,255,255,0.6)" />
              <Text style={styles.statText}>{currentPeak.commentsCount}</Text>
            </View>
            <View style={styles.stat}>
              <Ionicons name="eye" size={16} color="rgba(255,255,255,0.6)" />
              <Text style={styles.statText}>{currentPeak.viewsCount}</Text>
            </View>
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            {/* Save to profile */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleAction('save')}
              disabled={loading !== null}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#0EBF8A', '#0A9B6F']}
                style={styles.actionGradient}
              >
                {loading === 'save' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="bookmark-outline" size={22} color="#fff" />
                    <Text style={styles.actionText}>Keep on profile</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {/* Download */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleAction('download')}
              disabled={loading !== null}
              activeOpacity={0.8}
            >
              <View style={styles.actionSecondary}>
                {loading === 'download' ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={22} color={colors.white} />
                    <Text style={styles.actionTextSecondary}>Download</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>

            {/* Dismiss */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleAction('dismiss')}
              disabled={loading !== null}
              activeOpacity={0.8}
            >
              <View style={styles.actionDestructive}>
                {loading === 'dismiss' ? (
                  <ActivityIndicator color="#FF453A" size="small" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={22} color="#FF453A" />
                    <Text style={styles.actionTextDestructive}>Delete</Text>
                  </>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  counter: {
    position: 'absolute',
    top: 60,
    right: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  counterText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  caption: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
  },
  thumbnailContainer: {
    width: width * 0.55,
    height: width * 0.55 * 1.5,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 32,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
  },
  actions: {
    width: '100%',
    gap: 10,
  },
  actionButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  actionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
  },
  actionTextSecondary: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  actionDestructive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,69,58,0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,69,58,0.3)',
  },
  actionTextDestructive: {
    color: '#FF453A',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ExpiredPeakModal;
