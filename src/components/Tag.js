import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SIZES, BORDERS } from '../config/theme';

/**
 * Tag/Chip Component
 * 
 * @param {string} label - Tag text
 * @param {string} icon - Ionicons icon name
 * @param {boolean} selected - Selected state
 * @param {boolean} disabled - Disabled state
 * @param {string} variant - 'default' | 'filled' | 'outline' | 'filter'
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {function} onPress - Press handler
 * @param {boolean} removable - Show remove icon
 * @param {function} onRemove - Remove handler
 * @param {object} style - Additional styles
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
}) {
  // Size configurations
  const sizeConfig = {
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
  const getVariantStyles = () => {
    if (disabled) {
      return {
        backgroundColor: COLORS.backgroundDisabled,
        borderColor: 'transparent',
        borderWidth: 0,
        textColor: COLORS.grayMuted,
        iconColor: COLORS.grayMuted,
      };
    }

    if (selected) {
      return {
        backgroundColor: COLORS.primary,
        borderColor: COLORS.primary,
        borderWidth: BORDERS.medium,
        textColor: COLORS.white,
        iconColor: COLORS.white,
        useGradient: variant === 'filled',
      };
    }

    switch (variant) {
      case 'filled':
        return {
          backgroundColor: COLORS.backgroundSecondary,
          borderColor: 'transparent',
          borderWidth: 0,
          textColor: COLORS.dark,
          iconColor: COLORS.primary,
        };
      case 'outline':
        return {
          backgroundColor: COLORS.white,
          borderColor: COLORS.primary,
          borderWidth: BORDERS.medium,
          textColor: COLORS.dark,
          iconColor: COLORS.primary,
        };
      case 'filter':
        return {
          backgroundColor: COLORS.backgroundSecondary,
          borderColor: 'transparent',
          borderWidth: 0,
          textColor: COLORS.dark,
          iconColor: COLORS.dark,
        };
      default:
        return {
          backgroundColor: COLORS.white,
          borderColor: COLORS.primary,
          borderWidth: BORDERS.medium,
          textColor: COLORS.dark,
          iconColor: COLORS.primary,
        };
    }
  };

  const variantStyles = getVariantStyles();

  // Render content
  const renderContent = () => (
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

const styles = StyleSheet.create({
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
