// src/screens/sessions/BookSessionScreen.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { GRADIENTS } from '../../config/theme';
import { awsAPI, SessionPack } from '../../services/aws-api';
import OptimizedImage from '../../components/OptimizedImage';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { ScreenSkeleton } from '../../components/skeleton';
import { useCurrency } from '../../hooks/useCurrency';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface DateItem {
  day: string;
  date: number;
  month: string;
  fullDate: Date;
  isAvailable: boolean;
  slots: Array<{ time: string; datetime: string }>;
}

interface AvailableSlot {
  date: string;
  time: string;
  datetime: string;
}

interface CreatorInfo {
  id: string;
  name: string;
  username: string;
  avatar: string;
  sessionPrice: number;
  sessionDuration: number;
  timezone: string;
}

type BookingMode = 'single' | 'pack';

export default function BookSessionScreen(): React.JSX.Element {
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }>();
  const route = useRoute<{ key: string; name: string; params: { creatorId?: string; creator?: CreatorInfo } }>();
  const { colors, isDark } = useTheme();
  const { formatAmount: formatCurrencyAmount } = useCurrency();

  const { creatorId, creator: routeCreator } = route.params || {};

  const [bookingMode, setBookingMode] = useState<BookingMode>('single');
  const [selectedDate, setSelectedDate] = useState<DateItem | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);

  // API state
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creator, setCreator] = useState<CreatorInfo | null>(routeCreator || null);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [packs, setPacks] = useState<SessionPack[]>([]);

  // Duration options with calculated prices
  const durations = useMemo(() => {
    const basePrice = creator?.sessionPrice || 25;
    const baseDuration = creator?.sessionDuration || 30;
    const pricePerMin = basePrice / baseDuration;

    return [
      { value: 30, label: '30 min', price: Math.round(pricePerMin * 30) },
      { value: 45, label: '45 min', price: Math.round(pricePerMin * 45) },
      { value: 60, label: '60 min', price: Math.round(pricePerMin * 60) },
      { value: 90, label: '90 min', price: Math.round(pricePerMin * 90) },
    ];
  }, [creator]);

  // Fetch availability and packs
  const fetchData = useCallback(async () => {
    if (!creatorId && !routeCreator?.id) return;

    const targetCreatorId = creatorId || routeCreator?.id;
    if (!targetCreatorId) return;
    setLoading(true);

    try {
      // Fetch availability and packs in parallel
      const [availabilityRes, packsRes] = await Promise.all([
        awsAPI.getCreatorAvailability(targetCreatorId, { days: 14 }),
        awsAPI.listCreatorPacks(targetCreatorId),
      ]);

      if (availabilityRes.success && availabilityRes.creator) {
        setCreator(availabilityRes.creator);
        setAvailableSlots(availabilityRes.availableSlots || []);
        if (availabilityRes.creator.sessionDuration) {
          setSelectedDuration(availabilityRes.creator.sessionDuration);
        }
      }

      if (packsRes.success) {
        setPacks(packsRes.packs || []);
      }
    } catch (error: unknown) {
      if (__DEV__) console.warn('Error fetching booking data:', error);
      // SECURITY: Never expose raw error to users
      setErrorMessage('Failed to load booking data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [creatorId, routeCreator]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate dates with availability info from API
  const dates = useMemo((): DateItem[] => {
    const result: DateItem[] = [];
    const today = new Date();

    // Group slots by date
    const slotsByDate: Record<string, AvailableSlot[]> = {};
    availableSlots.forEach(slot => {
      if (!slotsByDate[slot.date]) {
        slotsByDate[slot.date] = [];
      }
      slotsByDate[slot.date].push(slot);
    });

    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay();
      const slotsForDate = slotsByDate[dateStr] || [];

      result.push({
        day: DAYS[dayOfWeek === 0 ? 6 : dayOfWeek - 1],
        date: date.getDate(),
        month: date.toLocaleString('default', { month: 'short' }),
        fullDate: date,
        isAvailable: slotsForDate.length > 0,
        slots: slotsForDate,
      });
    }
    return result;
  }, [availableSlots]);

  // Get time slots for selected date
  const timeSlots = useMemo(() => {
    if (!selectedDate) return [];
    return selectedDate.slots.map(slot => ({
      time: slot.time,
      datetime: slot.datetime,
      available: true,
    }));
  }, [selectedDate]);

  const handleBack = () => {
    navigation.goBack();
  };

  const handleContinue = () => {
    if (bookingMode === 'single' && selectedDate && selectedTime) {
      const duration = durations.find((d) => d.value === selectedDuration);
      const slot = selectedDate.slots.find(s => s.time === selectedTime);
      navigation.navigate('SessionPayment', {
        creator,
        date: selectedDate,
        time: selectedTime,
        datetime: slot?.datetime,
        duration: selectedDuration,
        price: duration?.price || 25,
        type: 'single',
      });
    } else if (bookingMode === 'pack' && selectedPack) {
      const pack = packs.find(p => p.id === selectedPack);
      if (pack) {
        navigation.navigate('PackPurchase', {
          creatorId: creator?.id,
          pack,
        });
      }
    }
  };

  const selectedDurationInfo = durations.find((d) => d.value === selectedDuration);
  const canContinue = bookingMode === 'single'
    ? (selectedDate && selectedTime)
    : selectedPack;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ScreenSkeleton />
      </SafeAreaView>
    );
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={[styles.loadingText, { color: colors.error, marginTop: 12 }]}>
            {errorMessage}
          </Text>
          <TouchableOpacity onPress={handleBack} style={{ marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 12 }}>
            <Text style={{ color: colors.white, fontWeight: '600', fontSize: 15 }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book 1-to-1 Session</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Creator Info */}
        {creator && (
          <View style={styles.creatorCard}>
            <OptimizedImage
              source={creator.avatar}
              style={styles.creatorAvatar as StyleProp<ImageStyle>}
              contentFit="cover"
              priority="high"
            />
            <View style={styles.creatorInfo}>
              <Text style={styles.creatorName}>{creator.name}</Text>
            </View>
          </View>
        )}

        {/* Session Type Toggle */}
        <View style={styles.sessionTypeContainer}>
          <TouchableOpacity
            style={[styles.sessionTypeButton, bookingMode === 'single' && styles.sessionTypeActive]}
            onPress={() => setBookingMode('single')}
          >
            <Text style={bookingMode === 'single' ? styles.sessionTypeTextActive : styles.sessionTypeText}>
              Single session
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sessionTypeButton, bookingMode === 'pack' && styles.sessionTypeActive]}
            onPress={() => setBookingMode('pack')}
          >
            <Text style={bookingMode === 'pack' ? styles.sessionTypeTextActive : styles.sessionTypeText}>
              Monthly pack
            </Text>
          </TouchableOpacity>
        </View>

        {bookingMode === 'single' ? (
          <>
            {/* Date Selection */}
            <Text style={styles.sectionTitle}>Select Date</Text>
            <Text style={styles.availabilityNote}>
              <Ionicons name="information-circle-outline" size={12} color="#8E8E93" /> Only available dates are selectable
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.datesContainer}
              contentContainerStyle={styles.datesContent}
            >
              {dates.map((item, index) => {
                const isSelected = selectedDate?.fullDate.getTime() === item.fullDate.getTime();
                const isAvailable = item.isAvailable;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.dateItem,
                      isSelected && styles.dateItemSelected,
                      !isAvailable && styles.dateItemUnavailable,
                    ]}
                    onPress={() => {
                      if (isAvailable) {
                        setSelectedDate(item);
                        setSelectedTime(null);
                      }
                    }}
                    disabled={!isAvailable}
                  >
                    <Text style={[
                      styles.dateDay,
                      isSelected && styles.dateDaySelected,
                      !isAvailable && styles.dateDayUnavailable,
                    ]}>
                      {item.day}
                    </Text>
                    <Text style={[
                      styles.dateNumber,
                      isSelected && styles.dateNumberSelected,
                      !isAvailable && styles.dateNumberUnavailable,
                    ]}>
                      {item.date}
                    </Text>
                    <Text style={[
                      styles.dateMonth,
                      isSelected && styles.dateMonthSelected,
                      !isAvailable && styles.dateMonthUnavailable,
                    ]}>
                      {item.month}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Time Selection */}
            <Text style={styles.sectionTitle}>Select Time</Text>
            {timeSlots.length === 0 ? (
              <Text style={styles.noSlotsText}>
                {selectedDate ? 'No available time slots for this date' : 'Select a date to see available times'}
              </Text>
            ) : (
              <View style={styles.timeSlotsContainer}>
                {timeSlots.map((slot) => {
                  const isSelected = selectedTime === slot.time;
                  return (
                    <TouchableOpacity
                      key={slot.time}
                      style={[
                        styles.timeSlot,
                        isSelected && styles.timeSlotSelected,
                      ]}
                      onPress={() => setSelectedTime(slot.time)}
                    >
                      <Text style={[
                        styles.timeSlotText,
                        isSelected && styles.timeSlotTextSelected,
                      ]}>
                        {slot.time}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Duration Selection */}
            <Text style={styles.sectionTitle}>Session Duration</Text>
            <View style={styles.durationsContainer}>
              {durations.map((duration) => {
                const isSelected = selectedDuration === duration.value;
                return (
                  <TouchableOpacity
                    key={duration.value}
                    style={[styles.durationItem, isSelected && styles.durationItemSelected]}
                    onPress={() => setSelectedDuration(duration.value)}
                  >
                    <Text style={[styles.durationLabel, isSelected && styles.durationLabelSelected]}>
                      {duration.label}
                    </Text>
                    <Text style={[styles.durationPrice, isSelected && styles.durationPriceSelected]}>
                      {formatCurrencyAmount(duration.price * 100)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : (
          <>
            {/* Packs Selection */}
            <Text style={styles.sectionTitle}>Available Packs</Text>
            {packs.length === 0 ? (
              <Text style={styles.noSlotsText}>No packs available from this creator</Text>
            ) : (
              packs.map((pack) => {
                const isSelected = selectedPack === pack.id;
                return (
                  <TouchableOpacity
                    key={pack.id}
                    style={[styles.packCard, isSelected && styles.packCardSelected]}
                    onPress={() => setSelectedPack(pack.id)}
                  >
                    <View style={styles.packHeader}>
                      <View style={styles.packNameRow}>
                        <Text style={styles.packName}>{pack.name}</Text>
                        {pack.savings && pack.savings > 0 && (
                          <View style={styles.savingsBadge}>
                            <Text style={styles.savingsBadgeText}>-{pack.savings}%</Text>
                          </View>
                        )}
                      </View>
                      {isSelected && (
                        <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
                      )}
                    </View>

                    <View style={styles.packDetails}>
                      <View style={styles.packDetailRow}>
                        <Ionicons name="time-outline" size={14} color="#8E8E93" />
                        <Text style={styles.packDetailText}>
                          {pack.sessionsIncluded} sessions × {pack.sessionDuration}min
                        </Text>
                      </View>
                      <View style={styles.packDetailRow}>
                        <Ionicons name="calendar-outline" size={14} color="#8E8E93" />
                        <Text style={styles.packDetailText}>
                          Valid {pack.validityDays} days from purchase
                        </Text>
                      </View>
                    </View>

                    {pack.description && (
                      <Text style={styles.packDescription}>{pack.description}</Text>
                    )}

                    <Text style={styles.packPrice}>{formatCurrencyAmount(pack.price * 100)}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Button */}
      <View style={styles.bottomContainer}>
        <View style={styles.priceInfo}>
          <Text style={styles.priceLabel}>Total</Text>
          <Text style={styles.priceValue}>
            {formatCurrencyAmount((bookingMode === 'single'
              ? (selectedDurationInfo?.price || 25)
              : (packs.find(p => p.id === selectedPack)?.price || 0)) * 100)}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleContinue}
          disabled={!canContinue}
          activeOpacity={0.9}
          style={styles.continueButtonWrapper}
        >
          <LinearGradient
            colors={canContinue ? GRADIENTS.primary : ['#ccc', '#ccc']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.continueButton}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color="white" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.dark,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    color: colors.dark,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : 'rgba(14, 191, 138, 0.08)',
    borderRadius: 16,
    padding: 16,
    marginTop: 20,
    marginBottom: 24,
  },
  creatorAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  creatorInfo: {
    marginLeft: 12,
  },
  creatorName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.dark,
  },
  creatorSpecialty: {
    fontSize: 14,
    color: colors.gray,
    marginTop: 2,
  },
  sessionTypeContainer: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  sessionTypeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  sessionTypeActive: {
    backgroundColor: colors.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sessionTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray,
  },
  sessionTypeTextActive: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 12,
  },
  availabilityNote: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: 12,
    marginTop: -8,
  },
  noSlotsText: {
    fontSize: 14,
    color: colors.gray,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  datesContainer: {
    marginBottom: 24,
    marginHorizontal: -20,
  },
  datesContent: {
    paddingHorizontal: 20,
    gap: 10,
  },
  dateItem: {
    width: 64,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    marginRight: 10,
  },
  dateItemSelected: {
    backgroundColor: colors.primary,
  },
  dateDay: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: 4,
  },
  dateDaySelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  dateNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 2,
  },
  dateNumberSelected: {
    color: 'white',
  },
  dateMonth: {
    fontSize: 11,
    color: colors.gray,
  },
  dateMonthSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  dateItemUnavailable: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(10, 37, 47, 0.02)',
    opacity: 0.5,
  },
  dateDayUnavailable: {
    color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(10, 37, 47, 0.3)',
  },
  dateNumberUnavailable: {
    color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(10, 37, 47, 0.3)',
  },
  dateMonthUnavailable: {
    color: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(10, 37, 47, 0.3)',
  },
  timeSlotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  timeSlot: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  timeSlotSelected: {
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.2)' : 'rgba(14, 191, 138, 0.1)',
    borderColor: colors.primary,
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.dark,
  },
  timeSlotTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  },
  durationsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  durationItem: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  durationItemSelected: {
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.2)' : 'rgba(14, 191, 138, 0.1)',
    borderColor: colors.primary,
  },
  durationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  durationLabelSelected: {
    color: colors.primary,
  },
  durationPrice: {
    fontSize: 13,
    color: colors.gray,
  },
  durationPriceSelected: {
    color: colors.primary,
  },
  // Pack styles
  packCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  packCardSelected: {
    backgroundColor: isDark ? 'rgba(14, 191, 138, 0.15)' : 'rgba(14, 191, 138, 0.08)',
    borderColor: colors.primary,
  },
  packHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  packNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  packName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  savingsBadge: {
    backgroundColor: '#22C55E20',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  savingsBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#22C55E',
  },
  packDetails: {
    marginBottom: 12,
  },
  packDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  packDetailText: {
    fontSize: 13,
    color: colors.gray,
  },
  packDescription: {
    fontSize: 13,
    color: colors.gray,
    marginBottom: 12,
  },
  packPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.dark,
  },
  bottomSpacer: {
    height: 100,
  },
  bottomContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  priceInfo: {
    marginRight: 16,
  },
  priceLabel: {
    fontSize: 12,
    color: colors.gray,
  },
  priceValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.dark,
  },
  continueButtonWrapper: {
    flex: 1,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
    gap: 8,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
