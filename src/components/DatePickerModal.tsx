import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, type ThemeColors } from '../hooks/useTheme';

interface DatePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (date: string) => void;
  initialDate?: string;
}
const ITEM_HEIGHT = 50;
const VISIBLE_ITEMS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

// Generate years (1920 - current year)
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 1920 + 1 }, (_, i) => currentYear - i);

// Months
const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

// Generate days (1-31)
const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));

/**
 * DatePickerModal - Carousel-style date picker
 *
 * @param {boolean} visible - Show/hide the modal
 * @param {function} onClose - Callback when closed
 * @param {function} onConfirm - Callback with selected date (YYYY-MM-DD)
 * @param {string} initialDate - Initial date (YYYY-MM-DD)
 */
export default function DatePickerModal({ visible, onClose, onConfirm, initialDate }: DatePickerModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Parse initial date or use default values
  const parseInitialDate = () => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      const [year, month, day] = initialDate.split('-');
      return { year: parseInt(year), month, day };
    }
    return { year: 1990, month: '01', day: '15' };
  };

  const initial = parseInitialDate();
  const [selectedYear, setSelectedYear] = useState(initial.year);
  const [selectedMonth, setSelectedMonth] = useState(initial.month);
  const [selectedDay, setSelectedDay] = useState(initial.day);

  const yearListRef = useRef<FlatList<number>>(null);
  const monthListRef = useRef<FlatList<{ value: string; label: string }>>(null);
  const dayListRef = useRef<FlatList<string>>(null);

  // Scroll to initial values when modal opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        scrollToYear(initial.year);
        scrollToMonth(initial.month);
        scrollToDay(initial.day);
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialDate]);

  const scrollToYear = (year: number) => {
    const index = YEARS.indexOf(year);
    if (index !== -1 && yearListRef.current) {
      yearListRef.current.scrollToOffset({
        offset: index * ITEM_HEIGHT,
        animated: false,
      });
    }
  };

  const scrollToMonth = (month: string) => {
    const index = MONTHS.findIndex(m => m.value === month);
    if (index !== -1 && monthListRef.current) {
      monthListRef.current.scrollToOffset({
        offset: index * ITEM_HEIGHT,
        animated: false,
      });
    }
  };

  const scrollToDay = (day: string) => {
    const index = DAYS.indexOf(day);
    if (index !== -1 && dayListRef.current) {
      dayListRef.current.scrollToOffset({
        offset: index * ITEM_HEIGHT,
        animated: false,
      });
    }
  };

  const handleYearScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    if (index >= 0 && index < YEARS.length) {
      setSelectedYear(YEARS[index]);
    }
  };

  const handleMonthScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    if (index >= 0 && index < MONTHS.length) {
      setSelectedMonth(MONTHS[index].value);
    }
  };

  const handleDayScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    if (index >= 0 && index < DAYS.length) {
      setSelectedDay(DAYS[index]);
    }
  };

  const handleConfirm = () => {
    const dateString = `${selectedYear}-${selectedMonth}-${selectedDay}`;
    onConfirm(dateString);
    onClose();
  };

  const renderYearItem = ({ item }: { item: number }) => {
    const isSelected = item === selectedYear;
    return (
      <View style={styles.pickerItem}>
        <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
          {item}
        </Text>
      </View>
    );
  };

  const renderMonthItem = ({ item }: { item: { value: string; label: string } }) => {
    const isSelected = item.value === selectedMonth;
    return (
      <View style={styles.pickerItem}>
        <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
          {item.label}
        </Text>
      </View>
    );
  };

  const renderDayItem = ({ item }: { item: string }) => {
    const isSelected = item === selectedDay;
    return (
      <View style={styles.pickerItem}>
        <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextSelected]}>
          {item}
        </Text>
      </View>
    );
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
            <Text style={styles.title}>Date of Birth</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.dark} />
            </TouchableOpacity>
          </View>

          {/* Picker Container */}
          <View style={styles.pickerContainer}>
            {/* Selection Indicator */}
            <View style={styles.selectionIndicator} />

            {/* Month Picker */}
            <View style={styles.pickerColumn}>
              <FlatList
                ref={monthListRef}
                data={MONTHS}
                renderItem={renderMonthItem}
                keyExtractor={(item) => item.value}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                onMomentumScrollEnd={handleMonthScroll}
                contentContainerStyle={{
                  paddingVertical: ITEM_HEIGHT * 2,
                }}
                getItemLayout={(data, index) => ({
                  length: ITEM_HEIGHT,
                  offset: ITEM_HEIGHT * index,
                  index,
                })}
              />
            </View>

            {/* Day Picker */}
            <View style={styles.pickerColumn}>
              <FlatList
                ref={dayListRef}
                data={DAYS}
                renderItem={renderDayItem}
                keyExtractor={(item) => item}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                onMomentumScrollEnd={handleDayScroll}
                contentContainerStyle={{
                  paddingVertical: ITEM_HEIGHT * 2,
                }}
                getItemLayout={(data, index) => ({
                  length: ITEM_HEIGHT,
                  offset: ITEM_HEIGHT * index,
                  index,
                })}
              />
            </View>

            {/* Year Picker */}
            <View style={styles.pickerColumn}>
              <FlatList
                ref={yearListRef}
                data={YEARS}
                renderItem={renderYearItem}
                keyExtractor={(item) => String(item)}
                showsVerticalScrollIndicator={false}
                snapToInterval={ITEM_HEIGHT}
                decelerationRate="fast"
                onMomentumScrollEnd={handleYearScroll}
                contentContainerStyle={{
                  paddingVertical: ITEM_HEIGHT * 2,
                }}
                getItemLayout={(data, index) => ({
                  length: ITEM_HEIGHT,
                  offset: ITEM_HEIGHT * index,
                  index,
                })}
              />
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmButtonText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
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
  pickerContainer: {
    flexDirection: 'row',
    height: PICKER_HEIGHT,
    paddingHorizontal: 16,
    position: 'relative',
  },
  selectionIndicator: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 16,
    right: 16,
    height: ITEM_HEIGHT,
    backgroundColor: colors.primary,
    borderRadius: 12,
    opacity: 0.15,
  },
  pickerColumn: {
    flex: 1,
    height: PICKER_HEIGHT,
  },
  pickerItem: {
    height: ITEM_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerItemText: {
    fontSize: 16,
    color: colors.gray,
    fontWeight: '500',
  },
  pickerItemTextSelected: {
    fontSize: 18,
    color: colors.dark,
    fontWeight: '700',
  },
  buttonsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
});
