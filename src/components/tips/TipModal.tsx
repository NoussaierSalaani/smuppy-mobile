/**
 * TipModal Component
 * Modern, futuristic tip modal with animations
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DARK_COLORS as COLORS, GRADIENTS } from '../../config/theme';
import { useCurrency } from '../../hooks/useCurrency';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TipModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (amount: number, message?: string, isAnonymous?: boolean) => Promise<void>;
  receiver: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
  };
  contextType: 'profile' | 'live' | 'peak' | 'battle';
  presetAmounts?: number[];
  isLoading?: boolean;
}

const DEFAULT_PRESETS = [200, 500, 1000, 2000]; // in cents

const TipModal: React.FC<TipModalProps> = ({
  visible,
  onClose,
  onConfirm,
  receiver,
  contextType: _contextType,
  presetAmounts = DEFAULT_PRESETS,
  isLoading = false,
}) => {
  const { currency, formatAmount } = useCurrency();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const selectedButtonAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      fadeAnim.setValue(0);
      resetState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resetState = () => {
    setSelectedAmount(null);
    setCustomAmount('');
    setShowCustom(false);
    setMessage('');
    setIsAnonymous(false);
    setError(null);
  };

  const handleSelectAmount = (amount: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.sequence([
      Animated.timing(selectedButtonAnim, {
        toValue: 0.9,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.spring(selectedButtonAnim, {
        toValue: 1,
        tension: 200,
        friction: 10,
        useNativeDriver: true,
      }),
    ]).start();

    setSelectedAmount(amount);
    setShowCustom(false);
    setCustomAmount('');
    setError(null);
  };

  const handleCustomAmountChange = (text: string) => {
    // Only allow numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    setCustomAmount(cleaned);
    setSelectedAmount(null);

    if (cleaned) {
      const amountCents = Math.round(parseFloat(cleaned) * 100);
      if (amountCents < 100) {
        setError('Minimum tip is ' + formatAmount(100));
      } else if (amountCents > 50000) {
        setError('Maximum tip is ' + formatAmount(50000));
      } else {
        setError(null);
      }
    } else {
      setError(null);
    }
  };

  const getFinalAmount = (): number => {
    if (selectedAmount) return selectedAmount;
    if (customAmount) return Math.round(parseFloat(customAmount) * 100);
    return 0;
  };

  const handleConfirm = async () => {
    const amount = getFinalAmount();
    if (amount < 100) {
      setError('Please select or enter an amount');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await onConfirm(amount, message || undefined, isAnonymous);
  };

  const renderAmountButton = (amount: number) => {
    const isSelected = selectedAmount === amount;

    return (
      <Animated.View
        key={amount}
        style={[
          { transform: [{ scale: isSelected ? selectedButtonAnim : 1 }] },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.amountButton,
            isSelected && styles.amountButtonSelected,
          ]}
          onPress={() => handleSelectAmount(amount)}
          activeOpacity={0.8}
        >
          {isSelected ? (
            <LinearGradient
              colors={GRADIENTS.primary}
              style={styles.amountButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Text style={styles.amountButtonTextSelected}>
                {formatAmount(amount)}
              </Text>
            </LinearGradient>
          ) : (
            <Text style={styles.amountButtonText}>{formatAmount(amount)}</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <BlurView intensity={30} tint="dark" style={styles.blur}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={onClose}
          />

          <Animated.View
            style={[
              styles.modal,
              {
                opacity: fadeAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <LinearGradient
                  colors={['#FFD700', '#FFA500']}
                  style={styles.iconGradient}
                >
                  <Ionicons name="gift" size={28} color="#FFF" />
                </LinearGradient>
              </View>
              <Text style={styles.title}>Send a Tip</Text>
              <Text style={styles.subtitle}>
                to <Text style={styles.username}>@{receiver.username}</Text>
              </Text>
            </View>

            {/* Amount Selection */}
            <View style={styles.amountsContainer}>
              <View style={styles.amountsRow}>
                {presetAmounts.slice(0, 2).map(renderAmountButton)}
              </View>
              <View style={styles.amountsRow}>
                {presetAmounts.slice(2, 4).map(renderAmountButton)}
              </View>
            </View>

            {/* Custom Amount */}
            <TouchableOpacity
              style={styles.customToggle}
              onPress={() => {
                setShowCustom(!showCustom);
                setSelectedAmount(null);
              }}
            >
              <Ionicons
                name={showCustom ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={COLORS.gray}
              />
              <Text style={styles.customToggleText}>Custom amount</Text>
            </TouchableOpacity>

            {showCustom && (
              <View style={styles.customInputContainer}>
                <Text style={styles.currencySymbol}>{currency.symbol}</Text>
                <TextInput
                  style={styles.customInput}
                  value={customAmount}
                  onChangeText={handleCustomAmountChange}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.gray}
                  keyboardType="decimal-pad"
                  autoFocus
                />
              </View>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            {/* Message */}
            <View style={styles.messageContainer}>
              <TextInput
                style={styles.messageInput}
                value={message}
                onChangeText={setMessage}
                placeholder="Add a message (optional)"
                placeholderTextColor={COLORS.gray}
                maxLength={200}
                multiline
              />
            </View>

            {/* Anonymous Toggle */}
            <TouchableOpacity
              style={styles.anonymousToggle}
              onPress={() => setIsAnonymous(!isAnonymous)}
            >
              <View
                style={[
                  styles.checkbox,
                  isAnonymous && styles.checkboxChecked,
                ]}
              >
                {isAnonymous && (
                  <Ionicons name="checkmark" size={14} color={COLORS.white} />
                )}
              </View>
              <Text style={styles.anonymousText}>Send anonymously</Text>
            </TouchableOpacity>

            {/* Total */}
            {getFinalAmount() > 0 && (
              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalAmount}>
                  {formatAmount(getFinalAmount())}
                </Text>
              </View>
            )}

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                disabled={isLoading}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (!getFinalAmount() || error) && styles.confirmButtonDisabled,
                ]}
                onPress={handleConfirm}
                disabled={!getFinalAmount() || !!error || isLoading}
              >
                <LinearGradient
                  colors={
                    getFinalAmount() && !error
                      ? ['#FFD700', '#FFA500']
                      : [COLORS.darkGray, COLORS.darkGray]
                  }
                  style={styles.confirmButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {isLoading ? (
                    <ActivityIndicator color={COLORS.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="gift" size={18} color={COLORS.white} />
                      <Text style={styles.confirmButtonText}>Send Tip</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Secure Payment */}
            <View style={styles.secureRow}>
              <Ionicons name="lock-closed" size={12} color={COLORS.gray} />
              <Text style={styles.secureText}>Secure payment via Stripe</Text>
            </View>
          </Animated.View>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    width: SCREEN_WIDTH - 40,
    backgroundColor: COLORS.darkGray,
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 25,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconContainer: {
    marginBottom: 12,
  },
  iconGradient: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.gray,
  },
  username: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  amountsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  amountsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  amountButton: {
    width: (SCREEN_WIDTH - 100) / 2,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.dark,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  amountButtonSelected: {
    borderWidth: 0,
  },
  amountButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  amountButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  amountButtonTextSelected: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  customToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  customToggleText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.dark,
    borderRadius: 16,
    paddingHorizontal: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.gray,
    marginRight: 8,
  },
  customInput: {
    flex: 1,
    height: 56,
    fontSize: 24,
    fontWeight: '600',
    color: COLORS.white,
  },
  errorText: {
    fontSize: 13,
    color: COLORS.error,
    textAlign: 'center',
    marginTop: 8,
  },
  messageContainer: {
    marginTop: 16,
  },
  messageInput: {
    backgroundColor: COLORS.dark,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.white,
    minHeight: 60,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  anonymousToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingVertical: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  anonymousText: {
    fontSize: 14,
    color: COLORS.lightGray,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalLabel: {
    fontSize: 16,
    color: COLORS.gray,
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFD700',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  cancelButton: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    backgroundColor: COLORS.dark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  confirmButton: {
    flex: 1.5,
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  secureText: {
    fontSize: 12,
    color: COLORS.gray,
  },
});

export default TipModal;
