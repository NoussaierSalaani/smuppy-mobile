import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

const COLORS = {
  primary: '#11E3A3',
  dark: '#0A0A0F',
  white: '#FFFFFF',
  gray: '#8E8E93',
  cardBg: '#1C1C1E',
};

const CreateOptionsPopup = ({ visible, onClose, onSelectPost, onSelectPeak }) => {
  const slideAnim = useRef(new Animated.Value(height)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 20,
          stiffness: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: height,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  const handleSelectPost = () => {
    onClose();
    setTimeout(() => onSelectPost(), 100);
  };

  const handleSelectPeak = () => {
    onClose();
    setTimeout(() => onSelectPeak(), 100);
  };

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity 
          style={styles.backdrop} 
          activeOpacity={1} 
          onPress={onClose}
        />
        
        <Animated.View 
          style={[
            styles.container,
            { transform: [{ translateY: slideAnim }] }
          ]}
        >
          {/* Handle */}
          <View style={styles.handle} />

          {/* Title */}
          <Text style={styles.title}>Create</Text>

          {/* Options */}
          <View style={styles.options}>
            {/* Post Option */}
            <TouchableOpacity 
              style={styles.option}
              onPress={handleSelectPost}
              activeOpacity={0.7}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="images-outline" size={28} color={COLORS.primary} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Post</Text>
                <Text style={styles.optionDesc}>Share photos or videos</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
            </TouchableOpacity>

            {/* Peak Option */}
            <TouchableOpacity 
              style={styles.option}
              onPress={handleSelectPeak}
              activeOpacity={0.7}
            >
              <View style={[styles.optionIcon, styles.peakIcon]}>
                <Ionicons name="videocam" size={28} color={COLORS.dark} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={styles.optionTitle}>Peak</Text>
                <Text style={styles.optionDesc}>Short video 6-15 seconds</Text>
              </View>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
            </TouchableOpacity>
          </View>

          {/* Cancel Button */}
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  container: {
    backgroundColor: COLORS.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.gray,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    opacity: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dark,
    padding: 16,
    borderRadius: 16,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(17, 227, 163, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  peakIcon: {
    backgroundColor: COLORS.primary,
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 13,
    color: COLORS.gray,
  },
  newBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  newBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.dark,
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray,
  },
});

export default CreateOptionsPopup;