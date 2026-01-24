// src/screens/sessions/BookSessionScreen.tsx
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { COLORS, GRADIENTS } from '../../config/theme';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Mock creator's available slots (would come from API)
const CREATOR_AVAILABILITY = {
  // Days of week the creator is available (0 = Sunday, 1 = Monday, etc.)
  availableDays: [1, 3, 5], // Mon, Wed, Fri
  // Time slots with their availability
  timeSlots: [
    { time: '09:00', available: true },
    { time: '10:00', available: true },
    { time: '11:00', available: false }, // Already booked
    { time: '14:00', available: true },
    { time: '15:00', available: true },
    { time: '16:00', available: false }, // Already booked
    { time: '17:00', available: true },
    { time: '18:00', available: true },
  ],
  // Available durations with prices set by creator
  durations: [
    { value: 30, label: '30 min', price: 25 },
    { value: 45, label: '45 min', price: 35 },
    { value: 60, label: '60 min', price: 45 },
    { value: 90, label: '90 min', price: 65 },
  ],
};

// Mock packs offered by creator
const CREATOR_PACKS = [
  {
    id: 'pack-1',
    name: 'Premium Pack',
    sessions: 8,
    duration: 60,
    validity: 30,
    price: 350,
    offerings: [
      { title: 'Custom Training Program', description: '8-week personalized workout plan' },
      { title: 'Nutrition Guide', description: 'Meal plan tailored to your goals' },
      { title: 'Video Library Access', description: 'Access to 50+ training videos' },
    ],
    isPopular: true,
  },
  {
    id: 'pack-2',
    name: 'Starter Pack',
    sessions: 4,
    duration: 45,
    validity: 30,
    price: 150,
    offerings: [
      { title: 'Beginner Program', description: 'Perfect for fitness beginners' },
    ],
    isPopular: false,
  },
];

interface DateItem {
  day: string;
  date: number;
  month: string;
  fullDate: Date;
  isAvailable: boolean;
}

type BookingMode = 'single' | 'pack';

export default function BookSessionScreen(): React.JSX.Element {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { creator } = route.params || {
    creator: {
      id: '1',
      name: 'Apte Fitness',
      avatar: 'https://i.pravatar.cc/100?img=33',
      specialty: 'Personal Training',
    },
  };

  const [bookingMode, setBookingMode] = useState<BookingMode>('single');
  const [selectedDate, setSelectedDate] = useState<DateItem | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(CREATOR_AVAILABILITY.durations[0]?.value || 30);
  const [selectedPack, setSelectedPack] = useState<string | null>(null);

  // Generate next 14 days with availability info
  const dates = useMemo((): DateItem[] => {
    const result: DateItem[] = [];
    const today = new Date();

    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dayOfWeek = date.getDay();
      const isAvailable = CREATOR_AVAILABILITY.availableDays.includes(dayOfWeek);
      result.push({
        day: DAYS[dayOfWeek === 0 ? 6 : dayOfWeek - 1],
        date: date.getDate(),
        month: date.toLocaleString('default', { month: 'short' }),
        fullDate: date,
        isAvailable,
      });
    }
    return result;
  }, []);

  const handleBack = () => {
    navigation.goBack();
  };

  const handleContinue = () => {
    if (bookingMode === 'single' && selectedDate && selectedTime) {
      const duration = CREATOR_AVAILABILITY.durations.find((d) => d.value === selectedDuration);
      navigation.navigate('SessionPayment', {
        creator,
        date: selectedDate,
        time: selectedTime,
        duration: selectedDuration,
        price: duration?.price || 25,
        type: 'single',
      });
    } else if (bookingMode === 'pack' && selectedPack) {
      const pack = CREATOR_PACKS.find(p => p.id === selectedPack);
      if (pack) {
        navigation.navigate('SessionPayment', {
          creator,
          pack,
          type: 'pack',
        });
      }
    }
  };

  const selectedDurationInfo = CREATOR_AVAILABILITY.durations.find((d) => d.value === selectedDuration);
  const canContinue = bookingMode === 'single'
    ? (selectedDate && selectedTime)
    : selectedPack;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book 1-to-1 Session</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Creator Info */}
        <View style={styles.creatorCard}>
          <Image source={{ uri: creator.avatar }} style={styles.creatorAvatar} />
          <View style={styles.creatorInfo}>
            <Text style={styles.creatorName}>{creator.name}</Text>
            <Text style={styles.creatorSpecialty}>{creator.specialty}</Text>
          </View>
        </View>

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
                    onPress={() => isAvailable && setSelectedDate(item)}
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
            <View style={styles.timeSlotsContainer}>
              {CREATOR_AVAILABILITY.timeSlots.map((slot) => {
                const isSelected = selectedTime === slot.time;
                const isAvailable = slot.available;
                return (
                  <TouchableOpacity
                    key={slot.time}
                    style={[
                      styles.timeSlot,
                      isSelected && styles.timeSlotSelected,
                      !isAvailable && styles.timeSlotUnavailable,
                    ]}
                    onPress={() => isAvailable && setSelectedTime(slot.time)}
                    disabled={!isAvailable}
                  >
                    <Text style={[
                      styles.timeSlotText,
                      isSelected && styles.timeSlotTextSelected,
                      !isAvailable && styles.timeSlotTextUnavailable,
                    ]}>
                      {slot.time}
                    </Text>
                    {!isAvailable && (
                      <Text style={styles.bookedLabel}>Booked</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Duration Selection */}
            <Text style={styles.sectionTitle}>Session Duration</Text>
            <View style={styles.durationsContainer}>
              {CREATOR_AVAILABILITY.durations.map((duration) => {
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
                      ${duration.price}
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
            {CREATOR_PACKS.map((pack) => {
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
                      {pack.isPopular && (
                        <View style={styles.popularBadge}>
                          <Text style={styles.popularBadgeText}>Popular</Text>
                        </View>
                      )}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color={COLORS.primary} />
                    )}
                  </View>

                  <View style={styles.packDetails}>
                    <View style={styles.packDetailRow}>
                      <Ionicons name="time-outline" size={14} color="#8E8E93" />
                      <Text style={styles.packDetailText}>{pack.sessions} sessions × {pack.duration}min</Text>
                    </View>
                    <View style={styles.packDetailRow}>
                      <Ionicons name="calendar-outline" size={14} color="#8E8E93" />
                      <Text style={styles.packDetailText}>Valid {pack.validity} days from purchase</Text>
                    </View>
                  </View>

                  {/* Offerings */}
                  <View style={styles.packOfferingsSection}>
                    <Text style={styles.packOfferingsTitle}>What's included:</Text>
                    {pack.offerings.map((offering, idx) => (
                      <View key={idx} style={styles.packOfferingItem}>
                        <Ionicons name="checkmark-circle" size={16} color={COLORS.primary} />
                        <View style={styles.packOfferingInfo}>
                          <Text style={styles.packOfferingTitle}>{offering.title}</Text>
                          <Text style={styles.packOfferingDesc}>{offering.description}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  <Text style={styles.packPrice}>${pack.price}</Text>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bottom Button */}
      <View style={styles.bottomContainer}>
        <View style={styles.priceInfo}>
          <Text style={styles.priceLabel}>Total</Text>
          <Text style={styles.priceValue}>
            ${bookingMode === 'single'
              ? (selectedDurationInfo?.price || 25)
              : (CREATOR_PACKS.find(p => p.id === selectedPack)?.price || 0)}
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
  },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 191, 138, 0.08)',
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
    borderColor: COLORS.primary,
  },
  creatorInfo: {
    marginLeft: 12,
  },
  creatorName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.dark,
  },
  creatorSpecialty: {
    fontSize: 14,
    color: 'rgba(10, 37, 47, 0.6)',
    marginTop: 2,
  },
  sessionTypeContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(10, 37, 47, 0.05)',
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
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sessionTypeText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(10, 37, 47, 0.5)',
  },
  sessionTypeTextActive: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 12,
  },
  availabilityNote: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 12,
    marginTop: -8,
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
    backgroundColor: 'rgba(10, 37, 47, 0.04)',
    alignItems: 'center',
    marginRight: 10,
  },
  dateItemSelected: {
    backgroundColor: COLORS.primary,
  },
  dateDay: {
    fontSize: 12,
    color: 'rgba(10, 37, 47, 0.5)',
    marginBottom: 4,
  },
  dateDaySelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  dateNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 2,
  },
  dateNumberSelected: {
    color: 'white',
  },
  dateMonth: {
    fontSize: 11,
    color: 'rgba(10, 37, 47, 0.5)',
  },
  dateMonthSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  dateItemUnavailable: {
    backgroundColor: 'rgba(10, 37, 47, 0.02)',
    opacity: 0.5,
  },
  dateDayUnavailable: {
    color: 'rgba(10, 37, 47, 0.3)',
  },
  dateNumberUnavailable: {
    color: 'rgba(10, 37, 47, 0.3)',
  },
  dateMonthUnavailable: {
    color: 'rgba(10, 37, 47, 0.3)',
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
    backgroundColor: 'rgba(10, 37, 47, 0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  timeSlotSelected: {
    backgroundColor: 'rgba(14, 191, 138, 0.1)',
    borderColor: COLORS.primary,
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.dark,
  },
  timeSlotTextSelected: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  timeSlotUnavailable: {
    backgroundColor: 'rgba(10, 37, 47, 0.02)',
    opacity: 0.6,
  },
  timeSlotTextUnavailable: {
    color: 'rgba(10, 37, 47, 0.4)',
  },
  bookedLabel: {
    fontSize: 9,
    color: '#FF3B30',
    fontWeight: '600',
    marginTop: 2,
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
    backgroundColor: 'rgba(10, 37, 47, 0.04)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  durationItemSelected: {
    backgroundColor: 'rgba(14, 191, 138, 0.1)',
    borderColor: COLORS.primary,
  },
  durationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 4,
  },
  durationLabelSelected: {
    color: COLORS.primary,
  },
  durationPrice: {
    fontSize: 13,
    color: 'rgba(10, 37, 47, 0.5)',
  },
  durationPriceSelected: {
    color: COLORS.primary,
  },
  // Pack styles
  packCard: {
    backgroundColor: '#F9F9F9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  packCardSelected: {
    backgroundColor: 'rgba(14, 191, 138, 0.08)',
    borderColor: COLORS.primary,
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
    color: COLORS.dark,
  },
  popularBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  popularBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: 'white',
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
    color: '#8E8E93',
  },
  packOfferingsSection: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  packOfferingsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 8,
  },
  packOfferingItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  packOfferingInfo: {
    flex: 1,
  },
  packOfferingTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.dark,
  },
  packOfferingDesc: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  packPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.dark,
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
    borderTopColor: 'rgba(0,0,0,0.05)',
    backgroundColor: 'white',
  },
  priceInfo: {
    marginRight: 16,
  },
  priceLabel: {
    fontSize: 12,
    color: 'rgba(10, 37, 47, 0.5)',
  },
  priceValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.dark,
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
