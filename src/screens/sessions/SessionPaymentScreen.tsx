// src/screens/sessions/SessionPaymentScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, GRADIENTS } from '../../config/theme';

type PaymentMethod = 'card' | 'paypal' | 'google' | 'apple';

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  icon: string;
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { id: 'card', label: 'Credit/Debit Card', icon: 'card-outline' },
  { id: 'paypal', label: 'PayPal', icon: 'logo-paypal' },
  { id: 'google', label: 'Google Pay', icon: 'logo-google' },
  { id: 'apple', label: 'Apple Pay', icon: 'logo-apple' },
];

export default function SessionPaymentScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { creator, date, time, duration, price } = route.params || {
    creator: { name: 'Apte Fitness', avatar: 'https://i.pravatar.cc/100?img=33' },
    date: { date: 15, month: 'Sep' },
    time: '15:00',
    duration: 60,
    price: 20,
  };

  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('card');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleBack = () => {
    navigation.goBack();
  };

  const handlePayment = async () => {
    setIsProcessing(true);

    // Simulate payment processing
    setTimeout(() => {
      setIsProcessing(false);
      navigation.replace('SessionBooked', {
        creator,
        date,
        time,
        duration,
      });
    }, 1500);
  };

  const formatDate = () => {
    const d = date.fullDate || new Date();
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={styles.content}>
        {/* Session Summary */}
        <View style={styles.summaryCard}>
          <Image source={{ uri: creator.avatar }} style={styles.creatorAvatar} />
          <View style={styles.summaryInfo}>
            <Text style={styles.creatorName}>{creator.name}</Text>
            <Text style={styles.sessionDetails}>
              {formatDate()} • {time} • {duration} min
            </Text>
          </View>
          <Text style={styles.price}>${price}</Text>
        </View>

        {/* Payment Methods */}
        <Text style={styles.sectionTitle}>Payment Method</Text>
        <View style={styles.paymentOptions}>
          {PAYMENT_OPTIONS.map((option) => {
            const isSelected = selectedPayment === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.paymentOption, isSelected && styles.paymentOptionSelected]}
                onPress={() => setSelectedPayment(option.id)}
              >
                <Ionicons
                  name={option.icon as any}
                  size={22}
                  color={isSelected ? COLORS.primary : COLORS.dark}
                />
                <Text style={[styles.paymentLabel, isSelected && styles.paymentLabelSelected]}>
                  {option.label}
                </Text>
                <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Bottom Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity
          onPress={handlePayment}
          disabled={isProcessing}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={GRADIENTS.primary}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.payButton}
          >
            {isProcessing ? (
              <Text style={styles.payButtonText}>Processing...</Text>
            ) : (
              <>
                <Text style={styles.payButtonText}>Pay and book</Text>
                <Ionicons name="arrow-forward" size={20} color="white" />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.dark,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 37, 47, 0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
  },
  creatorAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  creatorName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
  sessionDetails: {
    fontSize: 13,
    color: 'rgba(10, 37, 47, 0.6)',
    marginTop: 2,
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.dark,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 16,
  },
  paymentOptions: {
    gap: 12,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(10, 37, 47, 0.1)',
    backgroundColor: 'white',
  },
  paymentOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(14, 191, 138, 0.05)',
  },
  paymentLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.dark,
    marginLeft: 12,
  },
  paymentLabelSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(10, 37, 47, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: COLORS.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },
  bottomContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    backgroundColor: 'white',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    gap: 8,
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
