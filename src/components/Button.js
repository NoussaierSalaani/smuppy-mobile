import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SIZES, SHADOWS, TYPOGRAPHY } from '../config/theme';

/**
 * Button Component
 * 
 * @param {string} variant - 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'live' | 'reminder'
 * @param {string} size - 'xs' | 'sm' | 'md' | 'lg'
 * @param {boolean} disabled - Disable the button
 * @param {boolean} loading - Show loading spinner
 * @param {string} icon - Ionicons icon name
 * @param {string} iconPosition - 'left' | 'right'
 * @param {function} onPress - Press handler
 * @param {object} style - Additional styles
 * @param {object} textStyle - Additional text styles
 * @param {ReactNode} children - Button text or content
 */
export default function Button({
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'right',
  onPress,
  style,
  textStyle,
  children,
}) {
  // Get size styles
  const sizeStyles = {
    xs: {
      height: SIZES.buttonSm,
      paddingHorizontal: 16,
      borderRadius: SIZES.radiusSm,
      fontSize: 10,
      iconSize: 12,
    },
    sm: {
      height: SIZES.buttonMd,
      paddingHorizontal: 16,
      borderRadius: SIZES.radiusMd,
      fontSize: 12,
      iconSize: 16,
    },
    md: {
      height: SIZES.buttonLg,
      paddingHorizontal: 24,
      borderRadius: 17,
      fontSize: 16,
      iconSize: 20,
    },
    lg: {
      height: SIZES.buttonXl,
      paddingHorizontal: 24,
      borderRadius: SIZES.radiusButton,
      fontSize: 18,
      iconSize: 16,
    },
  };

  const currentSize = sizeStyles[size];

  // Get variant styles
  const getVariantStyles = () => {
    const variants = {
      primary: {
        gradient: disabled ? GRADIENTS.buttonDisabled : GRADIENTS.button,
        textColor: disabled ? COLORS.grayMuted : COLORS.dark,
        borderWidth: 0,
        borderColor: 'transparent',
      },
      secondary: {
        gradient: null,
        backgroundColor: COLORS.white,
        textColor: disabled ? COLORS.grayMuted : COLORS.dark,
        borderWidth: disabled ? 2 : 0,
        borderColor: disabled ? COLORS.buttonBorder : 'transparent',
      },
      tertiary: {
        gradient: null,
        backgroundColor: COLORS.white,
        textColor: disabled ? COLORS.grayMuted : COLORS.dark,
        borderWidth: disabled ? 2 : 0,
        borderColor: disabled ? COLORS.grayLight : 'transparent',
      },
      ghost: {
        gradient: null,
        backgroundColor: 'transparent',
        textColor: disabled ? COLORS.grayMuted : COLORS.primary,
        borderWidth: 0,
        borderColor: 'transparent',
      },
      danger: {
        gradient: null,
        backgroundColor: COLORS.white,
        textColor: disabled ? COLORS.errorLight : COLORS.error,
        borderWidth: disabled ? 2 : 0,
        borderColor: disabled ? COLORS.errorLight : 'transparent',
      },
      live: {
        gradient: disabled ? GRADIENTS.liveDisabled : GRADIENTS.live,
        textColor: disabled ? '#FFA7A3' : COLORS.white,
        borderWidth: 0,
        borderColor: 'transparent',
      },
      reminder: {
        gradient: disabled ? GRADIENTS.reminderDisabled : GRADIENTS.reminder,
        textColor: disabled ? '#7CA0AE' : COLORS.white,
        borderWidth: 0,
        borderColor: 'transparent',
      },
    };
    return variants[variant] || variants.primary;
  };

  const variantStyles = getVariantStyles();

  // Render icon
  const renderIcon = () => {
    if (!icon || loading) return null;
    return (
      <Ionicons
        name={icon}
        size={currentSize.iconSize}
        color={variantStyles.textColor}
        style={iconPosition === 'left' ? styles.iconLeft : styles.iconRight}
      />
    );
  };

  // Render content
  const renderContent = () => (
    <View style={styles.content}>
      {iconPosition === 'left' && renderIcon()}
      {loading ? (
        <ActivityIndicator size="small" color={variantStyles.textColor} />
      ) : (
        <Text
          style={[
            styles.text,
            { 
              color: variantStyles.textColor,
              fontSize: currentSize.fontSize,
            },
            textStyle,
          ]}
        >
          {children}
        </Text>
      )}
      {iconPosition === 'right' && renderIcon()}
    </View>
  );

  // Button with gradient
  if (variantStyles.gradient) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[style]}
      >
        <LinearGradient
          colors={variantStyles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.button,
            {
              height: currentSize.height,
              paddingHorizontal: currentSize.paddingHorizontal,
              borderRadius: currentSize.borderRadius,
            },
            !disabled && SHADOWS.button,
          ]}
        >
          {renderContent()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // Button without gradient
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[
        styles.button,
        {
          height: currentSize.height,
          paddingHorizontal: currentSize.paddingHorizontal,
          borderRadius: currentSize.borderRadius,
          backgroundColor: variantStyles.backgroundColor,
          borderWidth: variantStyles.borderWidth,
          borderColor: variantStyles.borderColor,
        },
        !disabled && variant !== 'ghost' && SHADOWS.card,
        style,
      ]}
    >
      {renderContent()}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: 'Poppins-Medium',
    fontWeight: '500',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },
});
