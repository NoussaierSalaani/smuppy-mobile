import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HIT_SLOP } from '../config/theme';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

interface ErrorModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
  buttonText?: string;
}

/**
 * ErrorModal - Popup d'erreur style app
 */
export default function ErrorModal({
  visible,
  onClose,
  title = "Oops!",
  message = "Something went wrong. Please try again.",
  buttonText = "Try again"
}: ErrorModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.container}>
              {/* Close button */}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={HIT_SLOP.medium}>
                <Ionicons name="close" size={24} color={colors.grayMuted} />
              </TouchableOpacity>

              {/* Icon */}
              <View style={styles.iconBox}>
                <Ionicons name="alert-circle" size={40} color={colors.error} />
              </View>

              {/* Title */}
              <Text style={styles.title}>{title}</Text>

              {/* Message */}
              <Text style={styles.message}>{message}</Text>

              {/* Button */}
              <TouchableOpacity style={styles.btn} onPress={onClose}>
                <Text style={styles.btnText}>{buttonText}</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 32 },
  container: { width: '100%', backgroundColor: colors.background, borderRadius: 24, padding: 28, alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  iconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.errorLight, justifyContent: 'center', alignItems: 'center', marginBottom: 20, marginTop: 8 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 22, color: colors.dark, marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 14, color: colors.dark, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn: { width: '100%', paddingVertical: 16, backgroundColor: colors.error, borderRadius: 14, alignItems: 'center' },
  btnText: { fontFamily: 'WorkSans-SemiBold', fontSize: 16, color: colors.white },
});
