import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

interface GenderPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (gender: string) => void;
  selectedGender?: string;
}

interface GenderOption {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const GENDER_OPTIONS: GenderOption[] = [
  { id: 'male', label: 'Male', icon: 'male' },
  { id: 'female', label: 'Female', icon: 'female' },
  { id: 'other', label: 'Other', icon: 'person' },
];

/**
 * GenderPickerModal - Custom modal to select gender
 *
 * @param {boolean} visible - Show/hide the modal
 * @param {function} onClose - Callback when closing
 * @param {function} onSelect - Callback with selected gender
 * @param {string} selectedGender - Currently selected gender
 */
export default function GenderPickerModal({ visible, onClose, onSelect, selectedGender }: GenderPickerModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const handleSelect = (gender: string) => {
    onSelect(gender);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Gender</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.dark} />
            </TouchableOpacity>
          </View>

          {/* Options */}
          <View style={styles.optionsContainer}>
            {GENDER_OPTIONS.map((option) => {
              const isSelected = selectedGender?.toLowerCase() === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => handleSelect(option.label)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.optionIcon, isSelected && styles.optionIconSelected]}>
                    <Ionicons
                      name={option.icon}
                      size={28}
                      color={isSelected ? colors.white : colors.dark}
                    />
                  </View>
                  <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                    {option.label}
                  </Text>
                  {isSelected && (
                    <View style={styles.checkmark}>
                      <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Cancel Button */}
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    backgroundColor: colors.cardBg,
    borderRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsContainer: {
    padding: 16,
    gap: 12,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionSelected: {
    backgroundColor: isDark ? 'rgba(14,191,138,0.15)' : colors.primaryLight,
    borderColor: colors.primary,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  optionIconSelected: {
    backgroundColor: colors.primary,
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  optionLabelSelected: {
    color: colors.dark,
  },
  checkmark: {
    marginLeft: 8,
  },
  cancelButton: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.gray,
  },
});