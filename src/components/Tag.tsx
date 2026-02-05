import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GRADIENTS, SIZES, BORDERS } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

type TagVariant = 'default' | 'filled' | 'outline' | 'filter';
type TagSize = 'sm' | 'md' | 'lg';

interface SizeConfig {
  height: number;
  paddingHorizontal: number;
  fontSize: number;
  iconSize: number;
  borderRadius: number;
}

interface VariantStyle {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  iconColor: string;
  useGradient?: boolean;
}

interface TagProps {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected?: boolean;
  disabled?: boolean;
  variant?: TagVariant;
  size?: TagSize;
  onPress?: () => void;
  removable?: boolean;
  onRemove?: () => void;
  style?: ViewStyle;
}

/**
 * Tag/Chip Component
 */
export default function Tag({
  label,
  icon,
  selected = false,
  disabled = false,
  variant = 'default',
  size = 'md',
  onPress,
  removable = false,
  onRemove,
  style,
}: TagProps): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Size configurations
  const sizeConfig: Record<TagSize, SizeConfig> = {
    sm: {
      height: 28,
      paddingHorizontal: 12,
      fontSize: 12,
      iconSize: 14,
      borderRadius: SIZES.radiusSm,
    },
    md: {
      height: 36,
      paddingHorizontal: 14,
      fontSize: 14,
      iconSize: 18,
      borderRadius: 25,
    },
    lg: {
      height: 44,
      paddingHorizontal: 18,
      fontSize: 16,
      iconSize: 20,
      borderRadius: 25,
    },
  };

  const config = sizeConfig[size];

  // Get variant styles
  const getVariantStyles = (): VariantStyle => {
    if (disabled) {
      return {
        backgroundColor: colors.backgroundSecondary,
        borderColor: 'transparent',
        borderWidth: 0,
        textColor: colors.grayMuted,
        iconColor: colors.grayMuted,
      };
    }

    if (selected) {
      return {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
        borderWidth: BORDERS.medium,
        textColor: colors.white,
        iconColor: colors.white,
        useGradient: variant === 'filled',
      };
    }

    switch (variant) {
      case 'filled':
        return {
          backgroundColor: colors.backgroundSecondary,
          borderColor: 'transparent',
          borderWidth: 0,
          textColor: colors.dark,
          iconColor: colors.primary,
        };
      case 'outline':
        return {
          backgroundColor: colors.background,
          borderColor: colors.primary,
          borderWidth: BORDERS.medium,
          textColor: colors.dark,
          iconColor: colors.primary,
        };
      case 'filter':
        return {
          backgroundColor: colors.backgroundSecondary,
          borderColor: 'transparent',
          borderWidth: 0,
          textColor: colors.dark,
          iconColor: colors.dark,
        };
      default:
        return {
          backgroundColor: colors.background,
          borderColor: colors.primary,
          borderWidth: BORDERS.medium,
          textColor: colors.dark,
          iconColor: colors.primary,
        };
    }
  };

  const variantStyles = getVariantStyles();

  // Render content
  const renderContent = (): React.JSX.Element => (
    <View style={styles.content}>
      {icon && (
        <Ionicons
          name={icon}
          size={config.iconSize}
          color={variantStyles.iconColor}
          style={styles.icon}
        />
      )}
      <Text
        style={[
          styles.label,
          {
            fontSize: config.fontSize,
            color: variantStyles.textColor,
          },
        ]}
      >
        {label}
      </Text>
      {removable && (
        <TouchableOpacity
          onPress={onRemove}
          hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          style={styles.removeButton}
        >
          <Ionicons
            name="close"
            size={config.iconSize - 2}
            color={variantStyles.iconColor}
          />
        </TouchableOpacity>
      )}
    </View>
  );

  // With gradient background
  if (selected && variantStyles.useGradient) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        style={style}
      >
        <LinearGradient
          colors={GRADIENTS.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.tag,
            {
              height: config.height,
              paddingHorizontal: config.paddingHorizontal,
              borderRadius: config.borderRadius,
            },
          ]}
        >
          {renderContent()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // Default tag
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.tag,
        {
          height: config.height,
          paddingHorizontal: config.paddingHorizontal,
          borderRadius: config.borderRadius,
          backgroundColor: variantStyles.backgroundColor,
          borderWidth: variantStyles.borderWidth,
          borderColor: variantStyles.borderColor,
        },
        style,
      ]}
    >
      {renderContent()}
    </TouchableOpacity>
  );
}

const createStyles = (_colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 6,
  },
  label: {
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
  },
  removeButton: {
    marginLeft: 6,
  },
});
