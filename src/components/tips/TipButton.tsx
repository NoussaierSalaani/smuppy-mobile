/**
 * TipButton Component
 * Reusable tip button with integrated modal and payment flow
 */

import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import TipModal from './TipModal';
import { useTipPayment } from '../../hooks/useTipPayment';

interface TipButtonProps {
  recipient: {
    id: string;
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
  contextType: 'profile' | 'live' | 'peak' | 'battle';
  contextId?: string;
  variant?: 'default' | 'compact' | 'icon';
  disabled?: boolean;
  onTipSent?: () => void;
}

export default function TipButton({
  recipient,
  contextType,
  contextId,
  variant = 'default',
  disabled = false,
  onTipSent,
}: TipButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const { sendTip, isProcessing } = useTipPayment();

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowModal(true);
  };

  const handleConfirm = async (
    amount: number,
    message?: string,
    isAnonymous?: boolean
  ) => {
    const success = await sendTip(
      recipient,
      amount,
      { type: contextType, id: contextId },
      { message, isAnonymous }
    );

    if (success) {
      setShowModal(false);
      onTipSent?.();
    }
  };

  if (variant === 'icon') {
    return (
      <>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={handlePress}
          disabled={disabled || isProcessing}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['#FFD700', '#FFA500']}
            style={styles.iconGradient}
          >
            {isProcessing ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Ionicons name="gift" size={20} color="#000" />
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TipModal
          visible={showModal}
          onClose={() => setShowModal(false)}
          onConfirm={handleConfirm}
          receiver={{
            id: recipient.id,
            username: recipient.username,
            displayName: recipient.displayName || recipient.username,
            avatarUrl: recipient.avatarUrl,
          }}
          contextType={contextType}
          isLoading={isProcessing}
        />
      </>
    );
  }

  if (variant === 'compact') {
    return (
      <>
        <TouchableOpacity
          style={[styles.compactButton, disabled && styles.buttonDisabled]}
          onPress={handlePress}
          disabled={disabled || isProcessing}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#FFD700', '#FFA500']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.compactGradient}
          >
            {isProcessing ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <>
                <Ionicons name="gift" size={16} color="#000" />
                <Text style={styles.compactText}>Tip</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TipModal
          visible={showModal}
          onClose={() => setShowModal(false)}
          onConfirm={handleConfirm}
          receiver={{
            id: recipient.id,
            username: recipient.username,
            displayName: recipient.displayName || recipient.username,
            avatarUrl: recipient.avatarUrl,
          }}
          contextType={contextType}
          isLoading={isProcessing}
        />
      </>
    );
  }

  // Default variant
  return (
    <>
      <TouchableOpacity
        style={[styles.defaultButton, disabled && styles.buttonDisabled]}
        onPress={handlePress}
        disabled={disabled || isProcessing}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#FFD700', '#FFA500']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.defaultGradient}
        >
          {isProcessing ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <>
              <View style={styles.giftIconContainer}>
                <Ionicons name="gift" size={20} color="#000" />
              </View>
              <View style={styles.textContainer}>
                <Text style={styles.defaultText}>Send a Tip</Text>
                <Text style={styles.subText}>Support @{recipient.username}</Text>
              </View>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TipModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        onConfirm={handleConfirm}
        receiver={{
          id: recipient.id,
          username: recipient.username,
          displayName: recipient.displayName || recipient.username,
          avatarUrl: recipient.avatarUrl,
        }}
        contextType={contextType}
        isLoading={isProcessing}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Icon variant
  iconButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  iconGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Compact variant
  compactButton: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  compactGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  compactText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },

  // Default variant
  defaultButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  defaultGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  giftIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  defaultText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  subText: {
    fontSize: 12,
    color: 'rgba(0,0,0,0.6)',
    marginTop: 2,
  },

  buttonDisabled: {
    opacity: 0.5,
  },
});
