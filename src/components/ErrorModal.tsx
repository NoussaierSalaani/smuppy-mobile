import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../config/theme';

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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.container}>
              {/* Close button */}
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={COLORS.grayMuted} />
              </TouchableOpacity>

              {/* Icon */}
              <View style={styles.iconBox}>
                <Ionicons name="alert-circle" size={40} color={COLORS.error} />
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

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  container: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 28, alignItems: 'center' },
  closeBtn: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  iconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 20, marginTop: 8 },
  title: { fontFamily: 'WorkSans-Bold', fontSize: 22, color: COLORS.dark, marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 14, color: COLORS.dark, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  btn: { width: '100%', paddingVertical: 16, backgroundColor: COLORS.error, borderRadius: 14, alignItems: 'center' },
  btnText: { fontFamily: 'WorkSans-SemiBold', fontSize: 16, color: '#FFFFFF' },
});