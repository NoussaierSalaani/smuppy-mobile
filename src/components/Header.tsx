import React, { ReactNode, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SIZES } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  rightText?: string;
  transparent?: boolean;
  centerTitle?: boolean;
  leftComponent?: ReactNode;
  rightComponent?: ReactNode;
  style?: ViewStyle;
}

/**
 * Header Component
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
}: HeaderProps): React.JSX.Element {
  const { colors, isDark: _isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, _isDark), [colors, _isDark]);

  const renderLeft = (): ReactNode => {
    if (leftComponent) return leftComponent;

    if (showBack) {
      return (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          accessibilityHint="Double-tap to go back to previous screen"
        >
          <Ionicons name="chevron-back" size={28} color={colors.dark} />
        </TouchableOpacity>
      );
    }

    return <View style={styles.placeholder} />;
  };

  const renderRight = (): ReactNode => {
    if (rightComponent) return rightComponent;

    if (rightText) {
      return (
        <TouchableOpacity
          onPress={onRightPress}
          style={styles.rightTextButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={rightText}
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
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={rightIcon.replace(/-/g, ' ').replace('outline', '').trim()}
        >
          <Ionicons name={rightIcon} size={24} color={colors.dark} />
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

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  container: {
    backgroundColor: colors.white,
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
    color: colors.dark,
  },
  titleCentered: {
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: colors.gray,
    marginTop: 2,
  },
  rightText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    color: colors.primary,
  },
});
