/**
 * BusinessBookingScreen
 * Book a service or session at a business
 * Uses Stripe Checkout via WebBrowser (no PaymentSheet)
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { useStripeCheckout } from '../../hooks/useStripeCheckout';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { NavigationProp, ParamListBase } from '@react-navigation/native';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { formatDateLong } from '../../utils/dateFormatters';

interface BusinessBookingScreenProps {
  route: { params: { businessId: string; serviceId?: string } };
  navigation: NavigationProp<ParamListBase>;
}

interface Service {
  id: string;
  name: string;
  description?: string;
  price_cents: number;
  duration_minutes: number;
  image_url?: string;
  category: string;
}

interface TimeSlot {
  id: string;
  time: string;
  available: boolean;
  spots_left?: number;
}

interface Business {
  id: string;
  name: string;
  logo_url?: string;
  category_color: string;
}

export default function BusinessBookingScreen({ route, navigation }: BusinessBookingScreenProps) {
  const { colors, isDark } = useTheme();
  const { showError, showWarning } = useSmuppyAlert();
  const { businessId, serviceId } = route.params;
  const { formatAmount } = useCurrency();
  const { openCheckout } = useStripeCheckout();

  const [business, setBusiness] = useState<Business | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedDateString, setSelectedDateString] = useState<string>('');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [step, setStep] = useState<'service' | 'date' | 'time' | 'confirm'>('service');
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const today = new Date();

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const loadBusinessData = useCallback(async () => {
    try {
      const [profileRes, servicesRes] = await Promise.all([
        awsAPI.getBusinessProfile(businessId),
        awsAPI.getBusinessServices(businessId),
      ]);

      if (profileRes.success) {
        setBusiness({
          id: profileRes.business.id,
          name: profileRes.business.name,
          logo_url: profileRes.business.logo_url,
          category_color: profileRes.business.category.color,
        });
      }

      if (servicesRes.success) {
        const bookableServices = (servicesRes.services || []).filter(
          (s: Service & { is_subscription?: boolean }) => !s.is_subscription
        );
        setServices(bookableServices);

        if (serviceId) {
          const preselected = bookableServices.find((s: Service) => s.id === serviceId);
          if (preselected) {
            setSelectedService(preselected);
            setStep('date');
          }
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('Load business data error:', error);
      showError('Error', 'Failed to load business information');
    } finally {
      setIsLoading(false);
    }
  }, [businessId, serviceId, showError]);

  const loadTimeSlots = useCallback(async () => {
    if (!selectedService || !selectedDateString) return;

    setIsLoadingSlots(true);
    try {
      const response = await awsAPI.getBusinessAvailability(businessId, {
        serviceId: selectedService.id,
        date: selectedDateString,
      });

      if (response.success) {
        setTimeSlots(response.slots || []);
      }
    } catch (error) {
      if (__DEV__) console.warn('Load time slots error:', error);
    } finally {
      setIsLoadingSlots(false);
    }
  }, [businessId, selectedDateString, selectedService]);

  useEffect(() => {
    loadBusinessData();
  }, [loadBusinessData]);

  useEffect(() => {
    if (selectedService && selectedDateString) {
      loadTimeSlots();
    }
  }, [loadTimeSlots, selectedDateString, selectedService]);

  const handleSelectService = (service: Service) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedService(service);
    setShowServiceModal(false);
    setStep('date');
  };

  const handleDateChange = (_event: DateTimePickerEvent, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedDate(date);
      setSelectedDateString(date.toISOString().split('T')[0]);
      setSelectedSlot(null);
      setStep('time');
    }
  };

  const handleSelectSlot = (slot: TimeSlot) => {
    if (!slot.available) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedSlot(slot);
    setStep('confirm');
  };

  const handleBooking = async () => {
    if (!selectedService || !selectedDateString || !selectedSlot) return;

    setIsBooking(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      // Create Stripe Checkout session
      const response = await awsAPI.createBusinessCheckout({
        businessId,
        serviceId: selectedService.id,
        date: selectedDateString,
        slotId: selectedSlot.id,
      });

      if (!response.success || !response.checkoutUrl || !response.sessionId) {
        throw new Error('Failed to create checkout session');
      }

      // Open Stripe Checkout and verify payment status
      const checkoutResult = await openCheckout(response.checkoutUrl, response.sessionId);

      if (checkoutResult.status === 'cancelled') {
        return;
      }

      if (checkoutResult.status === 'failed') {
        throw new Error(checkoutResult.message);
      }

      if (checkoutResult.status === 'pending') {
        showWarning('Payment Processing', checkoutResult.message);
        return;
      }

      // Payment verified — navigate to success
      (navigation as unknown as { replace: (screen: string, params?: Record<string, unknown>) => void }).replace('BusinessBookingSuccess', {
        businessName: business?.name || 'Business',
        serviceName: selectedService.name,
        date: selectedDateString,
        time: selectedSlot.time,
      });
    } catch (error: unknown) {
      if (__DEV__) console.warn('Booking error:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = error instanceof Error ? error.message : 'Please try again';
      showError('Booking Failed', message);
    } finally {
      setIsBooking(false);
    }
  };

  const formatDate = (dateString: string) => formatDateLong(dateString);

  const renderServiceItem = (service: Service) => (
    <TouchableOpacity
      key={service.id}
      style={[
        styles.serviceItem,
        selectedService?.id === service.id && styles.serviceItemSelected,
      ]}
      onPress={() => handleSelectService(service)}
      activeOpacity={0.8}
    >
      {service.image_url && (
        <Image source={{ uri: service.image_url }} style={styles.serviceImage} />
      )}
      <View style={styles.serviceInfo}>
        <Text style={styles.serviceName}>{service.name}</Text>
        {service.description && (
          <Text style={styles.serviceDescription} numberOfLines={2}>
            {service.description}
          </Text>
        )}
        <View style={styles.serviceMeta}>
          <View style={styles.serviceMetaItem}>
            <Ionicons name="time-outline" size={14} color={colors.gray} />
            <Text style={styles.serviceMetaText}>{service.duration_minutes} min</Text>
          </View>
          <View style={styles.servicePrice}>
            <Text style={styles.servicePriceText}>{formatAmount(service.price_cents)}</Text>
          </View>
        </View>
      </View>
      {selectedService?.id === service.id && (
        <View style={styles.serviceCheck}>
          <Ionicons name="checkmark" size={16} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );

  const renderTimeSlot = (slot: TimeSlot) => (
    <TouchableOpacity
      key={slot.id}
      style={[
        styles.timeSlot,
        !slot.available && styles.timeSlotUnavailable,
        selectedSlot?.id === slot.id && styles.timeSlotSelected,
      ]}
      onPress={() => handleSelectSlot(slot)}
      disabled={!slot.available}
      activeOpacity={0.8}
    >
      <Text style={[
        styles.timeSlotText,
        !slot.available && styles.timeSlotTextUnavailable,
        selectedSlot?.id === slot.id && styles.timeSlotTextSelected,
      ]}>
        {slot.time}
      </Text>
      {slot.spots_left !== undefined && slot.available && (
        <Text style={styles.spotsLeft}>
          {slot.spots_left} {slot.spots_left === 1 ? 'spot' : 'spots'}
        </Text>
      )}
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1a1a2e', '#0f0f1a']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            {business?.logo_url && (
              <Image source={{ uri: business.logo_url }} style={styles.headerLogo} />
            )}
            <View>
              <Text style={styles.headerTitle}>Book at</Text>
              <Text style={styles.headerBusinessName}>{business?.name}</Text>
            </View>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Progress Steps */}
        <View style={styles.progressBar}>
          {['service', 'date', 'time', 'confirm'].map((s, i) => {
            const stepIndex = ['service', 'date', 'time', 'confirm'].indexOf(step);
            const isActive = i <= stepIndex;
            const isCurrent = s === step;
            return (
              <React.Fragment key={s}>
                <View style={[styles.progressDot, isActive && styles.progressDotActive, isCurrent && styles.progressDotCurrent]}>
                  <Text style={[styles.progressDotText, isActive && styles.progressDotTextActive]}>
                    {i + 1}
                  </Text>
                </View>
                {i < 3 && (
                  <View style={[styles.progressLine, isActive && styles.progressLineActive]} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Step 1: Select Service */}
          {step === 'service' && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Select Service</Text>
              <Text style={styles.stepSubtitle}>What would you like to book?</Text>

              {services.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={colors.gray} />
                  <Text style={styles.emptyTitle}>No bookable services</Text>
                </View>
              ) : (
                <View style={styles.servicesList}>
                  {services.map(renderServiceItem)}
                </View>
              )}
            </View>
          )}

          {/* Step 2: Select Date */}
          {step === 'date' && (
            <View style={styles.stepContainer}>
              <TouchableOpacity style={styles.selectedServiceCard} onPress={() => setShowServiceModal(true)}>
                <View style={styles.selectedServiceInfo}>
                  <Text style={styles.selectedServiceName}>{selectedService?.name}</Text>
                  <Text style={styles.selectedServiceMeta}>
                    {selectedService?.duration_minutes} min • {formatAmount(selectedService?.price_cents || 0)}
                  </Text>
                </View>
                <Ionicons name="pencil" size={18} color={colors.primary} />
              </TouchableOpacity>

              <Text style={styles.stepTitle}>Select Date</Text>
              <Text style={styles.stepSubtitle}>When would you like to visit?</Text>

              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar" size={24} color={colors.primary} />
                <Text style={styles.datePickerText}>
                  {selectedDateString ? formatDate(selectedDateString) : 'Tap to select a date'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={colors.gray} />
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="spinner"
                  minimumDate={today}
                  onChange={handleDateChange}
                  themeVariant="dark"
                />
              )}
            </View>
          )}

          {/* Step 3: Select Time */}
          {step === 'time' && (
            <View style={styles.stepContainer}>
              <TouchableOpacity style={styles.selectedServiceCard} onPress={() => setStep('date')}>
                <View style={styles.selectedServiceInfo}>
                  <Text style={styles.selectedServiceName}>{formatDate(selectedDateString)}</Text>
                  <Text style={styles.selectedServiceMeta}>
                    {selectedService?.name} • {selectedService?.duration_minutes} min
                  </Text>
                </View>
                <Ionicons name="pencil" size={18} color={colors.primary} />
              </TouchableOpacity>

              <Text style={styles.stepTitle}>Select Time</Text>
              <Text style={styles.stepSubtitle}>Available time slots</Text>

              {isLoadingSlots ? (
                <View style={styles.loadingSlots}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : timeSlots.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="time-outline" size={48} color={colors.gray} />
                  <Text style={styles.emptyTitle}>No available slots</Text>
                  <Text style={styles.emptySubtitle}>Try selecting a different date</Text>
                </View>
              ) : (
                <View style={styles.timeSlotsGrid}>
                  {timeSlots.map(renderTimeSlot)}
                </View>
              )}
            </View>
          )}

          {/* Step 4: Confirm */}
          {step === 'confirm' && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Confirm Booking</Text>
              <Text style={styles.stepSubtitle}>Review your booking details</Text>

              <View style={styles.confirmCard}>
                <View style={styles.confirmRow}>
                  <Ionicons name="calendar" size={20} color={colors.primary} />
                  <View style={styles.confirmInfo}>
                    <Text style={styles.confirmLabel}>Date</Text>
                    <Text style={styles.confirmValue}>{formatDate(selectedDateString)}</Text>
                  </View>
                </View>

                <View style={styles.confirmDivider} />

                <View style={styles.confirmRow}>
                  <Ionicons name="time" size={20} color={colors.primary} />
                  <View style={styles.confirmInfo}>
                    <Text style={styles.confirmLabel}>Time</Text>
                    <Text style={styles.confirmValue}>{selectedSlot?.time}</Text>
                  </View>
                </View>

                <View style={styles.confirmDivider} />

                <View style={styles.confirmRow}>
                  <Ionicons name="fitness" size={20} color={colors.primary} />
                  <View style={styles.confirmInfo}>
                    <Text style={styles.confirmLabel}>Service</Text>
                    <Text style={styles.confirmValue}>{selectedService?.name}</Text>
                    <Text style={styles.confirmSubvalue}>{selectedService?.duration_minutes} minutes</Text>
                  </View>
                </View>

                <View style={styles.confirmDivider} />

                <View style={styles.confirmRow}>
                  <Ionicons name="business" size={20} color={colors.primary} />
                  <View style={styles.confirmInfo}>
                    <Text style={styles.confirmLabel}>Location</Text>
                    <Text style={styles.confirmValue}>{business?.name}</Text>
                  </View>
                </View>
              </View>

              {/* Price Summary */}
              <View style={styles.priceSummary}>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Service</Text>
                  <Text style={styles.priceValue}>{formatAmount(selectedService?.price_cents || 0)}</Text>
                </View>
                <View style={styles.priceRowTotal}>
                  <Text style={styles.priceTotalLabel}>Total</Text>
                  <Text style={styles.priceTotalValue}>{formatAmount(selectedService?.price_cents || 0)}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Bottom Action */}
        <View style={styles.bottomAction}>
          <BlurView intensity={80} tint="dark" style={styles.bottomBlur}>
            {step === 'confirm' ? (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleBooking}
                disabled={isBooking}
              >
                <LinearGradient colors={GRADIENTS.primary} style={styles.actionGradient}>
                  {isBooking ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="card" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>
                        Pay {formatAmount(selectedService?.price_cents || 0)}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <View style={styles.bottomActions}>
                {step !== 'service' && (
                  <TouchableOpacity
                    style={styles.backStepButton}
                    onPress={() => {
                      if (step === 'date') setStep('service');
                      else if (step === 'time') setStep('date');
                    }}
                  >
                    <Ionicons name="arrow-back" size={20} color="#fff" />
                    <Text style={styles.backStepText}>Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    step === 'service' && !selectedService && styles.actionButtonDisabled,
                    step === 'date' && !selectedDateString && styles.actionButtonDisabled,
                    step === 'time' && !selectedSlot && styles.actionButtonDisabled,
                  ]}
                  onPress={() => {
                    if (step === 'service' && selectedService) setStep('date');
                    else if (step === 'date' && selectedDateString) setStep('time');
                    else if (step === 'time' && selectedSlot) setStep('confirm');
                  }}
                  disabled={
                    (step === 'service' && !selectedService) ||
                    (step === 'date' && !selectedDateString) ||
                    (step === 'time' && !selectedSlot)
                  }
                >
                  <LinearGradient
                    colors={GRADIENTS.primary}
                    style={styles.actionGradient}
                  >
                    <Text style={styles.actionButtonText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </BlurView>
        </View>
      </SafeAreaView>

      {/* Service Selection Modal */}
      <Modal visible={showServiceModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <BlurView intensity={80} tint="dark" style={styles.modalBlur}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Service</Text>
                <TouchableOpacity onPress={() => setShowServiceModal(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalScroll}>
                {services.map(renderServiceItem)}
              </ScrollView>
            </BlurView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
  },
  headerTitle: {
    fontSize: 12,
    color: colors.gray,
  },
  headerBusinessName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },

  // Progress
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 16,
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressDotActive: {
    backgroundColor: colors.primaryLight,
  },
  progressDotCurrent: {
    backgroundColor: colors.primary,
  },
  progressDotText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.gray,
  },
  progressDotTextActive: {
    color: colors.dark,
  },
  progressLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.backgroundSecondary,
    marginHorizontal: 8,
  },
  progressLineActive: {
    backgroundColor: colors.primaryLight,
  },

  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  stepContainer: {
    gap: 12,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.dark,
  },
  stepSubtitle: {
    fontSize: 14,
    color: colors.gray,
    marginBottom: 8,
  },

  // Selected Service Card
  selectedServiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    marginBottom: 8,
  },
  selectedServiceInfo: {
    flex: 1,
  },
  selectedServiceName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  selectedServiceMeta: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },

  // Services
  servicesList: {
    gap: 12,
  },
  serviceItem: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  serviceItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  serviceImage: {
    width: 80,
    height: 80,
  },
  serviceInfo: {
    flex: 1,
    padding: 12,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  serviceDescription: {
    fontSize: 13,
    color: colors.gray,
    marginBottom: 8,
  },
  serviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  serviceMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  serviceMetaText: {
    fontSize: 13,
    color: colors.gray,
  },
  servicePrice: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  servicePriceText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  serviceCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Date Picker
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  datePickerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.dark,
  },

  // Time Slots
  loadingSlots: {
    padding: 40,
    alignItems: 'center',
  },
  timeSlotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeSlot: {
    width: '23%',
    paddingVertical: 14,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  timeSlotUnavailable: {
    opacity: 0.4,
  },
  timeSlotSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  timeSlotTextUnavailable: {
    color: colors.gray,
    textDecorationLine: 'line-through',
  },
  timeSlotTextSelected: {
    color: colors.primary,
  },
  spotsLeft: {
    fontSize: 10,
    color: colors.gray,
    marginTop: 2,
  },

  // Confirm
  confirmCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 20,
    padding: 16,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingVertical: 12,
  },
  confirmInfo: {
    flex: 1,
  },
  confirmLabel: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: 4,
  },
  confirmValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  confirmSubvalue: {
    fontSize: 13,
    color: colors.gray,
    marginTop: 2,
  },
  confirmDivider: {
    height: 1,
    backgroundColor: colors.border,
  },

  // Price Summary
  priceSummary: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: colors.gray,
  },
  priceValue: {
    fontSize: 14,
    color: colors.dark,
  },
  priceRowTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  priceTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  priceTotalValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray,
  },

  // Bottom Action
  bottomAction: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  bottomBlur: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 34,
    backgroundColor: isDark ? 'rgba(15,15,26,0.9)' : 'rgba(255,255,255,0.9)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: 12,
  },
  backStepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 14,
    gap: 6,
  },
  backStepText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '70%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  modalBlur: {
    backgroundColor: isDark ? 'rgba(20,20,35,0.95)' : 'rgba(255,255,255,0.95)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  modalScroll: {
    padding: 16,
  },
});
