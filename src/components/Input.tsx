import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
  KeyboardTypeOptions,
  TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SIZES, SHADOWS, BORDERS } from '../config/theme';

type InputState = 'default' | 'focus' | 'error' | 'disabled';

interface StateStyle {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  labelColor: string;
  textColor: string;
  placeholderColor: string;
  iconColor: string;
}

interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  error?: string;
  disabled?: boolean;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  numberOfLines?: number;
  style?: ViewStyle;
  inputStyle?: TextStyle;
}

/**
 * Input Component
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
}: InputProps): React.JSX.Element {
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(secureTextEntry);

  // Determine current state
  const getState = (): InputState => {
    if (disabled) return 'disabled';
    if (error) return 'error';
    if (isFocused) return 'focus';
    return 'default';
  };

  const state = getState();

  // State-based styles
  const stateStyles: Record<InputState, StateStyle> = {
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
  const handleToggleSecure = (): void => {
    setIsSecure(!isSecure);
  };

  // Render right icon or password toggle
  const renderRightIcon = (): React.JSX.Element | null => {
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
