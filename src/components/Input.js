import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS, TYPOGRAPHY, BORDERS } from '../config/theme';

/**
 * Input Component
 * 
 * @param {string} label - Input label
 * @param {string} placeholder - Placeholder text
 * @param {string} value - Input value
 * @param {function} onChangeText - Change handler
 * @param {string} error - Error message (shows error state if provided)
 * @param {boolean} disabled - Disable the input
 * @param {string} leftIcon - Ionicons icon name for left side
 * @param {string} rightIcon - Ionicons icon name for right side
 * @param {function} onRightIconPress - Press handler for right icon
 * @param {boolean} secureTextEntry - Password input
 * @param {string} keyboardType - Keyboard type
 * @param {boolean} multiline - Multiline input
 * @param {number} numberOfLines - Number of lines for multiline
 * @param {object} style - Additional container styles
 * @param {object} inputStyle - Additional input styles
 */
export default function Input({
  label,
  placeholder,
  value,
  onChangeText,
  error,
  disabled = false,
  leftIcon,
  rightIcon,
  onRightIconPress,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  multiline = false,
  numberOfLines = 1,
  style,
  inputStyle,
  ...props
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry);

  // Determine current state
  const getState = () => {
    if (disabled) return 'disabled';
    if (error) return 'error';
    if (isFocused) return 'focus';
    return 'default';
  };

  const state = getState();

  // State-based styles
  const stateStyles = {
    default: {
      backgroundColor: COLORS.white,
      borderColor: COLORS.primary,
      borderWidth: BORDERS.thin,
      labelColor: COLORS.dark,
      textColor: COLORS.dark,
      placeholderColor: COLORS.grayLight,
      iconColor: COLORS.dark,
    },
    focus: {
      backgroundColor: COLORS.backgroundFocus,
      borderColor: COLORS.primary,
      borderWidth: BORDERS.thin,
      labelColor: COLORS.dark,
      textColor: COLORS.dark,
      placeholderColor: COLORS.grayLight,
      iconColor: COLORS.dark,
      ...SHADOWS.inputFocus,
    },
    error: {
      backgroundColor: COLORS.white,
      borderColor: COLORS.error,
      borderWidth: BORDERS.thin,
      labelColor: COLORS.dark,
      textColor: COLORS.error,
      placeholderColor: COLORS.grayLight,
      iconColor: COLORS.dark,
    },
    disabled: {
      backgroundColor: COLORS.backgroundDisabled,
      borderColor: 'transparent',
      borderWidth: 0,
      labelColor: COLORS.graySecondary,
      textColor: COLORS.grayLight,
      placeholderColor: COLORS.grayLight,
      iconColor: COLORS.grayMuted,
    },
  };

  const currentStyle = stateStyles[state];

  // Handle password visibility toggle
  const handleToggleSecure = () => {
    setIsSecure(!isSecure);
  };

  // Render right icon or password toggle
  const renderRightIcon = () => {
    if (secureTextEntry) {
      return (
        <TouchableOpacity onPress={handleToggleSecure} style={styles.iconButton}>
          <Ionicons
            name={isSecure ? 'eye-off-outline' : 'eye-outline'}
            size={SIZES.iconMd}
            color={currentStyle.iconColor}
          />
        </TouchableOpacity>
      );
    }
    if (rightIcon) {
      return (
        <TouchableOpacity
          onPress={onRightIconPress}
          disabled={!onRightIconPress}
          style={styles.iconButton}
        >
          <Ionicons
            name={rightIcon}
            size={SIZES.iconMd}
            color={currentStyle.iconColor}
          />
        </TouchableOpacity>
      );
    }
    return null;
  };

  return (
    <View style={[styles.container, style]}>
      {/* Label */}
      {label && (
        <Text style={[styles.label, { color: currentStyle.labelColor }]}>
          {label}
        </Text>
      )}

      {/* Input Container */}
      <View
        style={[
          styles.inputContainer,
          {
            backgroundColor: currentStyle.backgroundColor,
            borderColor: currentStyle.borderColor,
            borderWidth: currentStyle.borderWidth,
          },
          state === 'focus' && SHADOWS.inputFocus,
          multiline && { height: 'auto', minHeight: SIZES.inputHeight * numberOfLines },
        ]}
      >
        {/* Left Icon */}
        {leftIcon && (
          <Ionicons
            name={leftIcon}
            size={SIZES.iconMd}
            color={currentStyle.iconColor}
            style={styles.leftIcon}
          />
        )}

        {/* Text Input */}
        <TextInput
          style={[
            styles.input,
            { color: currentStyle.textColor },
            leftIcon && { paddingLeft: 0 },
            multiline && styles.multilineInput,
            inputStyle,
          ]}
          placeholder={placeholder}
          placeholderTextColor={currentStyle.placeholderColor}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          editable={!disabled}
          secureTextEntry={isSecure}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          numberOfLines={numberOfLines}
          textAlignVertical={multiline ? 'top' : 'center'}
          {...props}
        />

        {/* Right Icon / Password Toggle */}
        {renderRightIcon()}
      </View>

      {/* Error Message */}
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  label: {
    fontFamily: 'Poppins-Bold',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: SIZES.inputHeight,
    paddingHorizontal: 16,
    borderRadius: SIZES.radiusInput,
  },
  leftIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'Poppins-Regular',
    fontSize: 16,
    lineHeight: 22,
    paddingVertical: 16,
  },
  multilineInput: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  iconButton: {
    padding: 4,
    marginLeft: 10,
  },
  errorText: {
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.error,
    marginTop: 4,
  },
});
