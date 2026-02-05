import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

interface ActionOption {
  label: string;
  icon?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface SmuppyActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  options: ActionOption[];
  showCancel?: boolean;
  cancelLabel?: string;
}

const SmuppyActionSheet: React.FC<SmuppyActionSheetProps> = ({
  visible,
  onClose,
  title,
  subtitle,
  options,
  showCancel = true,
  cancelLabel = 'Cancel',
}) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleOptionPress = (option: ActionOption) => {
    if (option.disabled) return;
    onClose();
    // Small delay to let the modal close smoothly
    setTimeout(() => {
      option.onPress();
    }, 100);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.container, { paddingBottom: insets.bottom + 10 }]}>
              {/* Header with title */}
              {(title || subtitle) && (
                <View style={styles.header}>
                  {title && <Text style={styles.title}>{title}</Text>}
                  {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
              )}

              {/* Options */}
              <View style={styles.optionsContainer}>
                {options.map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.7}
                    disabled={option.disabled}
                    onPress={() => handleOptionPress(option)}
                    style={[
                      styles.optionButton,
                      index === 0 && styles.optionFirst,
                      index === options.length - 1 && styles.optionLast,
                      option.disabled && styles.optionDisabled,
                    ]}
                  >
                    {option.icon && (
                      <View style={[
                        styles.iconContainer,
                        option.destructive && styles.iconDestructive,
                      ]}>
                        <Ionicons
                          name={option.icon as keyof typeof Ionicons.glyphMap}
                          size={22}
                          color={option.destructive ? '#FF3B30' : '#0EBF8A'}
                        />
                      </View>
                    )}
                    <Text
                      style={[
                        styles.optionText,
                        option.destructive && styles.optionTextDestructive,
                        option.disabled && styles.optionTextDisabled,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={option.destructive ? '#FF3B30' : '#C7C7CC'}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Cancel button */}
              {showCancel && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={onClose}
                  style={styles.cancelButton}
                >
                  <LinearGradient
                    colors={isDark ? [colors.backgroundSecondary, colors.backgroundSecondary] : ['#F5F5F5', '#EBEBEB']}
                    style={styles.cancelGradient}
                  >
                    <Text style={styles.cancelText}>{cancelLabel}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// Quick helper for image picker options
export const useImagePickerSheet = () => {
  const [visible, setVisible] = React.useState(false);
  const [config, setConfig] = React.useState<{
    title: string;
    hasExisting: boolean;
    onTakePhoto: () => void;
    onChooseLibrary: () => void;
    onRemove?: () => void;
  } | null>(null);

  const show = (options: typeof config) => {
    setConfig(options);
    setVisible(true);
  };

  const hide = () => {
    setVisible(false);
    setConfig(null);
  };

  const options: ActionOption[] = config ? [
    {
      label: 'Take Photo',
      icon: 'camera-outline',
      onPress: config.onTakePhoto,
    },
    {
      label: 'Choose from Library',
      icon: 'images-outline',
      onPress: config.onChooseLibrary,
    },
    ...(config.hasExisting && config.onRemove ? [{
      label: 'Remove Photo',
      icon: 'trash-outline',
      onPress: config.onRemove,
      destructive: true,
    }] : []),
  ] : [];

  return {
    visible,
    show,
    hide,
    sheetProps: {
      visible,
      onClose: hide,
      title: config?.title || '',
      options,
    },
  };
};

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.cardBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.gray,
    textAlign: 'center',
  },
  optionsContainer: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.cardBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionFirst: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  optionLast: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderBottomWidth: 0,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(14, 191, 138, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconDestructive: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.dark,
  },
  optionTextDestructive: {
    color: '#FF3B30',
  },
  optionTextDisabled: {
    color: colors.grayMuted,
  },
  cancelButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 8,
  },
  cancelGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: isDark ? colors.backgroundSecondary : '#F5F5F5',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.dark,
  },
});

export default SmuppyActionSheet;
