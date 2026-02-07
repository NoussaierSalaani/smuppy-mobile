/**
 * External Payment Modal
 * Required disclosure when redirecting users to external payment
 * Compliant with Apple's External Link Entitlement requirements
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { GRADIENTS } from '../../config/theme';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface ExternalPaymentModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  productName: string;
  price: string;
  creatorName?: string;
}

const ExternalPaymentModal: React.FC<ExternalPaymentModalProps> = ({
  visible,
  onConfirm,
  onCancel,
  productName,
  price,
  creatorName,
}) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <BlurView intensity={20} tint="dark" style={styles.overlay}>
        <View style={styles.container}>
          {/* Header Icon */}
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={GRADIENTS.primary}
              style={styles.iconGradient}
            >
              <Ionicons name="open-outline" size={32} color={colors.white} />
            </LinearGradient>
          </View>

          {/* Title */}
          <Text style={styles.title}>Paiement sur smuppy.com</Text>

          {/* Product Info */}
          <View style={styles.productCard}>
            <Text style={styles.productName}>{productName}</Text>
            {creatorName && (
              <Text style={styles.creatorName}>avec {creatorName}</Text>
            )}
            <Text style={styles.price}>{price}</Text>
          </View>

          {/* Disclosure Text - Required by Apple */}
          <View style={styles.disclosureBox}>
            <Ionicons name="information-circle" size={20} color={colors.gray} />
            <Text style={styles.disclosureText}>
              Vous allez etre redirige vers smuppy.com pour finaliser votre paiement.
              Cette transaction sera traitee en dehors de l'App Store par notre
              prestataire de paiement securise (Stripe).
            </Text>
          </View>

          {/* Additional Info */}
          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
              <Text style={styles.infoText}>Paiement securise SSL 256-bit</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="card" size={18} color={colors.primary} />
              <Text style={styles.infoText}>Apple Pay, Google Pay, Carte acceptes</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="receipt" size={18} color={colors.primary} />
              <Text style={styles.infoText}>Recu envoye par email</Text>
            </View>
          </View>

          {/* Apple Required Notice */}
          <Text style={styles.appleNotice}>
            Apple n'est pas responsable de la confidentialite ou de la securite
            des transactions effectuees en dehors de l'App Store.
          </Text>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={GRADIENTS.primary}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.confirmGradient}
              >
                <Ionicons name="open-outline" size={18} color={colors.white} />
                <Text style={styles.confirmButtonText}>Continuer</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  container: {
    width: SCREEN_WIDTH - 48,
    backgroundColor: colors.cardBg,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconGradient: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 16,
    textAlign: 'center',
  },
  productCard: {
    width: '100%',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  creatorName: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 4,
  },
  price: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.primary,
    marginTop: 8,
  },
  disclosureBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  disclosureText: {
    flex: 1,
    fontSize: 13,
    color: colors.grayLight,
    lineHeight: 18,
  },
  infoSection: {
    width: '100%',
    gap: 10,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  infoText: {
    fontSize: 13,
    color: colors.grayLight,
  },
  appleNotice: {
    fontSize: 11,
    color: colors.gray,
    textAlign: 'center',
    lineHeight: 15,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  confirmButton: {
    flex: 1.5,
    height: 50,
    borderRadius: 14,
    overflow: 'hidden',
  },
  confirmGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default ExternalPaymentModal;
