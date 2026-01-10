import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SIZES, TYPOGRAPHY } from '../config/theme';

/**
 * Header Component
 * 
 * @param {string} title - Header title
 * @param {string} subtitle - Header subtitle
 * @param {boolean} showBack - Show back button
 * @param {function} onBack - Back button handler
 * @param {string} rightIcon - Right icon name
 * @param {function} onRightPress - Right icon handler
 * @param {string} rightText - Right text (e.g., "Skip")
 * @param {boolean} transparent - Transparent background
 * @param {boolean} centerTitle - Center the title
 * @param {ReactNode} leftComponent - Custom left component
 * @param {ReactNode} rightComponent - Custom right component
 * @param {object} style - Additional styles
 */
export default function Header({
  title,
  subtitle,
  showBack = true,
  onBack,
  rightIcon,
  onRightPress,
  rightText,
  transparent = false,
  centerTitle = false,
  leftComponent,
  rightComponent,
  style,
}) {
  const insets = useSafeAreaInsets();

  const renderLeft = () => {
    if (leftComponent) return leftComponent;
    
    if (showBack) {
      return (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={28} color={COLORS.dark} />
        </TouchableOpacity>
      );
    }
    
    return <View style={styles.placeholder} />;
  };

  const renderRight = () => {
    if (rightComponent) return rightComponent;
    
    if (rightText) {
      return (
        <TouchableOpacity
          onPress={onRightPress}
          style={styles.rightTextButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.rightText}>{rightText}</Text>
        </TouchableOpacity>
      );
    }
    
    if (rightIcon) {
      return (
        <TouchableOpacity
          onPress={onRightPress}
          style={styles.rightButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name={rightIcon} size={24} color={COLORS.dark} />
        </TouchableOpacity>
      );
    }
    
    return <View style={styles.placeholder} />;
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top || StatusBar.currentHeight || 44 },
        transparent && styles.transparent,
        style,
      ]}
    >
      <View style={styles.content}>
        {/* Left Section */}
        <View style={styles.leftSection}>
          {renderLeft()}
        </View>

        {/* Center Section */}
        <View style={[styles.centerSection, centerTitle && styles.centerSectionFull]}>
          {title && (
            <Text
              style={[
                styles.title,
                centerTitle && styles.titleCentered,
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
          )}
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right Section */}
        <View style={styles.rightSection}>
          {renderRight()}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderBottomWidth: 0,
  },
  transparent: {
    backgroundColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: SIZES.headerHeight,
    paddingHorizontal: SIZES.screenPadding,
  },
  leftSection: {
    width: 60,
    alignItems: 'flex-start',
  },
  centerSection: {
    flex: 1,
    alignItems: 'flex-start',
    paddingHorizontal: 8,
  },
  centerSectionFull: {
    alignItems: 'center',
  },
  rightSection: {
    width: 60,
    alignItems: 'flex-end',
  },
  backButton: {
    padding: 4,
    marginLeft: -4,
  },
  rightButton: {
    padding: 4,
    marginRight: -4,
  },
  rightTextButton: {
    padding: 4,
  },
  placeholder: {
    width: 32,
  },
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 18,
    lineHeight: 24,
    color: COLORS.dark,
  },
  titleCentered: {
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.gray,
    marginTop: 2,
  },
  rightText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: COLORS.primary,
  },
});
