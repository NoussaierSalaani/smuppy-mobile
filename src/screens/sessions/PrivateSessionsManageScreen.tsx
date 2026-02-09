// src/screens/sessions/PrivateSessionsManageScreen.tsx
// Creator's screen to manage their private 1:1 sessions availability
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarImage } from '../../components/OptimizedImage';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';
import { GRADIENTS } from '../../config/theme';
import { useUserStore } from '../../stores/userStore';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { awsAPI, Session, SessionPack as APISessionPack } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';

type TabType = 'calendar' | 'requests' | 'packs';
type SessionMode = 'unique' | 'range';

interface SessionRequest {
  id: string;
  fan: {
    name: string;
    avatar: string | null;
    memberSince: string; // e.g., "Jan 2024"
  };
  date: string;
  time: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'rejected';
}

interface PackOffering {
  id: string;
  type: 'training_program' | 'diet_plan' | 'video_access' | 'live_access' | 'custom';
  title: string;
  description: string;
}

interface SessionPack {
  id: string;
  name: string;
  sessions: number;
  duration: number;
  validity: number; // validity in days from purchase date
  price: number;
  isActive: boolean;
  isNew?: boolean;
  isPopular?: boolean;
  offerings: PackOffering[]; // What's included in the pack
}

interface AvailableSlot {
  time: string;
  duration: number;
  isBooked: boolean;
}

interface _ScheduledSession {
  id: string;
  title: string;
  date: Date;
  time: string;
  duration: number;
  price: number;
  isBooked: boolean;
  fanName?: string;
}

// Calendar data is fetched from API via getCreatorAvailability + session requests

const OFFERING_TYPES = [
  { key: 'training_program', label: 'Training Program', icon: 'barbell-outline' },
  { key: 'diet_plan', label: 'Diet / Nutrition Plan', icon: 'nutrition-outline' },
  { key: 'video_access', label: 'Video Library Access', icon: 'videocam-outline' },
  { key: 'live_access', label: 'Live Sessions Access', icon: 'radio-outline' },
  { key: 'custom', label: 'Custom Offering', icon: 'add-circle-outline' },
] as const;

const DAYS_OF_WEEK = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

const DURATIONS = [30, 45, 60, 90];

export default function PrivateSessionsManageScreen(): React.JSX.Element {
  const navigation = useNavigation<{ navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void }>();
  const _insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const { showAlert, showSuccess, showError, showDestructiveConfirm, showConfirm } = useSmuppyAlert();
  const user = useUserStore((state) => state.user);

  const { formatAmount: formatCurrencyAmount } = useCurrency();

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const [activeTab, setActiveTab] = useState<TabType>('calendar');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddPackModal, setShowAddPackModal] = useState(false);
  const [showDateSlotsModal, setShowDateSlotsModal] = useState(false);
  const [showAddOfferingModal, setShowAddOfferingModal] = useState(false);
  const [sessionMode, setSessionMode] = useState<SessionMode>('unique');
  const [selectedDate, setSelectedDate] = useState<number | null>(null);

  // Data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionRequests, setSessionRequests] = useState<SessionRequest[]>([]);
  const [creatorPacks, setCreatorPacks] = useState<SessionPack[]>([]);
  const [availableSlots, _setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [availabilityDates, setAvailabilityDates] = useState<string[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Protect route - only pro_creator can manage sessions
  useEffect(() => {
    if (user?.accountType !== 'pro_creator') {
      showAlert({
        title: 'Pro Creator Feature',
        message: 'Managing private sessions is only available for Pro Creator accounts.',
        type: 'warning',
        buttons: [{ text: 'OK', onPress: () => navigation.goBack() }],
      });
    }
  }, [user?.accountType, navigation, showAlert]);

  // Fetch data from API
  const fetchData = useCallback(async () => {
    try {
      // Fetch session requests (as creator)
      const sessionsResponse = await awsAPI.listSessions({ role: 'creator' });
      if (sessionsResponse.success && sessionsResponse.sessions) {
        const requests: SessionRequest[] = sessionsResponse.sessions.map((session: Session) => ({
          id: session.id,
          fan: {
            name: session.fan?.name || 'Unknown',
            avatar: session.fan?.avatar || null,
            memberSince: 'Member',
          },
          date: new Date(session.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          time: new Date(session.scheduledAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          duration: session.duration,
          status: session.status as 'pending' | 'confirmed' | 'rejected',
        }));
        setSessionRequests(requests);
      }

      // Fetch creator's packs
      if (user?.id) {
        const packsResponse = await awsAPI.listCreatorPacks(user.id);
        if (packsResponse.success && packsResponse.packs) {
          const packs: SessionPack[] = packsResponse.packs.map((pack: APISessionPack) => ({
            id: pack.id,
            name: pack.name,
            sessions: pack.sessionsIncluded,
            duration: pack.sessionDuration,
            validity: pack.validityDays,
            price: pack.price,
            isActive: pack.isActive ?? true,
            isNew: false,
            isPopular: false,
            offerings: [],
          }));
          setCreatorPacks(packs);
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch creator's availability slots for calendar display
  const fetchAvailability = useCallback(async () => {
    if (!user?.id) return;
    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const response = await awsAPI.getCreatorAvailability(user.id, { startDate, days: daysInMonth });
      if (response.success && response.availableSlots) {
        setAvailabilityDates(response.availableSlots.map(s => s.date));
      } else {
        setAvailabilityDates([]);
      }
    } catch {
      // Non-critical: calendar shows no availability on error
    }
  }, [user?.id, currentMonth]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchData(), fetchAvailability()]);
    setRefreshing(false);
  }, [fetchData, fetchAvailability]);

  // Pack offerings state
  const [packOfferings, setPackOfferings] = useState<PackOffering[]>([]);
  const [newOfferingType, setNewOfferingType] = useState<PackOffering['type']>('training_program');
  const [newOfferingTitle, setNewOfferingTitle] = useState('');
  const [newOfferingDesc, setNewOfferingDesc] = useState('');

  // Add session form states
  const [sessionTitle, setSessionTitle] = useState('Personal Training Session');
  const [sessionDate, _setSessionDate] = useState<Date>(new Date());
  const [sessionEndDate, _setSessionEndDate] = useState<Date>(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const [sessionTime, _setSessionTime] = useState('14:30');
  const [sessionDuration, setSessionDuration] = useState(60);
  const [sessionPrice, setSessionPrice] = useState('20');
  const [selectedDays, setSelectedDays] = useState<string[]>(['wed', 'fri', 'sat']);

  // Add pack form states
  const [packName, setPackName] = useState('');
  const [packSessions, setPackSessions] = useState('8');
  const [packDuration, setPackDuration] = useState(60);
  const [packValidity, setPackValidity] = useState('30');
  const [packPrice, setPackPrice] = useState('');

  // Calendar data
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');

  const handleBack = useCallback(() => navigation.goBack(), [navigation]);

  const toggleDay = useCallback((day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  }, []);

  // Calendar view toggle handlers
  const handleCalendarMonth = useCallback(() => setCalendarView('month'), []);
  const handleCalendarWeek = useCallback(() => setCalendarView('week'), []);

  // Modal open/close handlers
  const handleShowAddModal = useCallback(() => setShowAddModal(true), []);
  const handleCloseAddModal = useCallback(() => setShowAddModal(false), []);
  const handleShowAddPackModal = useCallback(() => {
    setPackOfferings([]);
    setShowAddPackModal(true);
  }, []);
  const handleCloseAddPackModal = useCallback(() => setShowAddPackModal(false), []);
  const handleShowAddOfferingModal = useCallback(() => setShowAddOfferingModal(true), []);
  const handleCloseAddOfferingModal = useCallback(() => setShowAddOfferingModal(false), []);
  const handleCloseDateSlotsModal = useCallback(() => setShowDateSlotsModal(false), []);

  // Month navigation handlers
  const handlePrevMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1));
  }, []);
  const handleNextMonth = useCallback(() => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1));
  }, []);

  // Session mode toggle handlers
  const handleSessionModeUnique = useCallback(() => setSessionMode('unique'), []);
  const handleSessionModeRange = useCallback(() => setSessionMode('range'), []);

  const handleSaveSession = useCallback(async () => {
    try {
      // Build availability object from selected days and times
      const availability: { [day: string]: { start: string; end: string }[] } = {};
      const dayMapping: { [key: string]: string } = {
        'mon': 'monday',
        'tue': 'tuesday',
        'wed': 'wednesday',
        'thu': 'thursday',
        'fri': 'friday',
        'sat': 'saturday',
        'sun': 'sunday',
      };

      // Initialize all days as empty
      Object.values(dayMapping).forEach(day => {
        if (!availability[day]) {
          availability[day] = [];
        }
      });

      // Add availability for selected days
      selectedDays.forEach(dayKey => {
        const day = dayMapping[dayKey.toLowerCase()] || dayKey.toLowerCase();
        availability[day] = [{ start: sessionTime || '09:00', end: '18:00' }];
      });

      const response = await awsAPI.updateSessionSettings({
        sessionsEnabled: true,
        sessionPrice: parseFloat(sessionPrice) || 20,
        sessionDuration: sessionDuration,
        sessionAvailability: availability,
      });

      if (response.success) {
        setShowAddModal(false);
        showSuccess('Success', 'Session availability saved!');
        fetchAvailability();
      } else {
        showError('Error', response.message || 'Failed to save session settings');
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to save session:', error);
      showError('Error', 'Failed to save session settings. Please try again.');
    }
  }, [selectedDays, sessionTime, sessionPrice, sessionDuration, showSuccess, showError, fetchAvailability]);

  const handleSavePack = useCallback(async () => {
    if (!packName.trim() || !packPrice) {
      showError('Error', 'Please fill in all required fields');
      return;
    }

    try {
      const response = await awsAPI.createPack({
        name: packName,
        description: '',
        sessionsIncluded: parseInt(packSessions) || 8,
        sessionDuration: packDuration,
        validityDays: parseInt(packValidity) || 30,
        price: parseFloat(packPrice) || 0,
        savingsPercent: 0,
      });

      if (response.success) {
        setShowAddPackModal(false);
        showSuccess('Success', 'Pack created successfully!');
        // Reset form
        setPackName('');
        setPackSessions('8');
        setPackDuration(60);
        setPackValidity('30');
        setPackPrice('');
        setPackOfferings([]);
        // Refresh data
        fetchData();
      } else {
        showError('Error', response.message || 'Failed to create pack');
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to create pack:', error);
      showError('Error', 'Failed to create pack. Please try again.');
    }
  }, [packName, packPrice, packSessions, packDuration, packValidity, showSuccess, showError, fetchData]);

  const handleTogglePackActive = useCallback(async (packId: string, currentActive: boolean) => {
    try {
      const response = await awsAPI.updatePack(packId, { isActive: !currentActive });
      if (response.success) {
        // Update local state
        setCreatorPacks(prev => prev.map(p =>
          p.id === packId ? { ...p, isActive: !currentActive } : p
        ));
      }
    } catch (error) {
      if (__DEV__) console.warn('Failed to update pack:', error);
      showError('Error', 'Failed to update pack');
    }
  }, [showError]);

  const handleDeletePack = useCallback(async (packId: string) => {
    showDestructiveConfirm(
      'Delete Pack',
      'Are you sure you want to delete this pack?',
      async () => {
        try {
          const response = await awsAPI.deletePack(packId);
          if (response.success) {
            setCreatorPacks(prev => prev.filter(p => p.id !== packId));
            showSuccess('Success', 'Pack deleted');
          } else {
            showError('Error', response.message || 'Failed to delete pack');
          }
        } catch (error) {
          if (__DEV__) console.warn('Failed to delete pack:', error);
          showError('Error', 'Failed to delete pack');
        }
      },
      'Delete',
    );
  }, [showDestructiveConfirm, showSuccess, showError]);

  const handleRequestAction = useCallback(async (id: string, action: 'accept' | 'reject') => {
    const onConfirm = async () => {
      try {
        const response = action === 'accept'
          ? await awsAPI.acceptSession(id)
          : await awsAPI.declineSession(id);

        if (response.success) {
          setSessionRequests(prev => prev.map(r =>
            r.id === id ? { ...r, status: action === 'accept' ? 'confirmed' : 'rejected' } : r
          ));
          showSuccess('Success', `Request ${action === 'accept' ? 'accepted' : 'rejected'}`);
        } else {
          showError('Error', response.message || `Failed to ${action} request`);
        }
      } catch (error) {
        if (__DEV__) console.warn(`Failed to ${action} request:`, error);
        showError('Error', `Failed to ${action} request`);
      }
    };

    if (action === 'reject') {
      showDestructiveConfirm(
        'Reject Request',
        `Are you sure you want to ${action} this booking request?`,
        onConfirm,
        'Reject',
      );
    } else {
      showConfirm(
        'Accept Request',
        `Are you sure you want to ${action} this booking request?`,
        onConfirm,
        'Accept',
      );
    }
  }, [showDestructiveConfirm, showConfirm, showSuccess, showError]);

  // Compute available/booked days for calendar from real API data
  const availableDaysSet = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = new Set<number>();
    for (const dateStr of availabilityDates) {
      const d = new Date(dateStr);
      if (d.getFullYear() === year && d.getMonth() === month) {
        days.add(d.getDate());
      }
    }
    return days;
  }, [availabilityDates, currentMonth]);

  const bookedDaysSet = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const days = new Set<number>();
    for (const request of sessionRequests) {
      if (request.status === 'confirmed') {
        const d = new Date(request.date);
        if (!isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month) {
          days.add(d.getDate());
        }
      }
    }
    return days;
  }, [sessionRequests, currentMonth]);

  const handleDateClick = useCallback((day: number) => {
    if (availableDaysSet.has(day)) {
      setSelectedDate(day);
      setShowDateSlotsModal(true);
    }
  }, [availableDaysSet]);

  const handleAddOffering = useCallback(() => {
    if (!newOfferingTitle.trim()) {
      showError('Error', 'Please enter a title for the offering');
      return;
    }
    const newOffering: PackOffering = {
      id: `offering-${Date.now()}`,
      type: newOfferingType,
      title: newOfferingTitle,
      description: newOfferingDesc,
    };
    setPackOfferings(prev => [...prev, newOffering]);
    setNewOfferingTitle('');
    setNewOfferingDesc('');
    setShowAddOfferingModal(false);
  }, [newOfferingTitle, newOfferingType, newOfferingDesc, showError]);

  const handleRemoveOffering = useCallback((id: string) => {
    setPackOfferings(prev => prev.filter(o => o.id !== id));
  }, []);

  const getOfferingIcon = useCallback((type: PackOffering['type']) => {
    const found = OFFERING_TYPES.find(t => t.key === type);
    return found?.icon || 'add-circle-outline';
  }, []);

  // Generate calendar days (memoized — recomputes only when month changes)
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days: (number | null)[] = [];

    // Add empty slots for days before first of month
    for (let i = 0; i < (firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1); i++) {
      days.push(null);
    }

    // Add days of month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(i);
    }

    return days;
  }, [currentMonth]);

  const renderCalendarTab = () => (
    <View style={styles.tabContent}>
      {/* View Toggle */}
      <View style={styles.calendarHeader}>
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewToggleBtn, calendarView === 'month' && styles.viewToggleBtnActive]}
            onPress={handleCalendarMonth}
          >
            <Text style={[styles.viewToggleText, calendarView === 'month' && styles.viewToggleTextActive]}>Month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewToggleBtn, calendarView === 'week' && styles.viewToggleBtnActive]}
            onPress={handleCalendarWeek}
          >
            <Text style={[styles.viewToggleText, calendarView === 'week' && styles.viewToggleTextActive]}>Week</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.addNewBtn} onPress={handleShowAddModal}>
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.addNewText}>New</Text>
        </TouchableOpacity>
      </View>

      {/* Month Navigation */}
      <View style={styles.monthNav}>
        <TouchableOpacity onPress={handlePrevMonth}>
          <Ionicons name="chevron-back" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={handleNextMonth}>
          <Ionicons name="chevron-forward" size={24} color={colors.dark} />
        </TouchableOpacity>
      </View>

      {/* Calendar Grid */}
      <View style={styles.calendarGrid}>
        {/* Day headers */}
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <Text key={day} style={styles.calendarDayHeader}>{day}</Text>
        ))}

        {/* Days */}
        {calendarDays.map((day, index) => {
          const isAvailable = day && availableDaysSet.has(day);
          const isBooked = day && bookedDaysSet.has(day);
          return (
            <TouchableOpacity
              key={index}
              style={styles.calendarDayCell}
              onPress={() => day && isAvailable && handleDateClick(day)}
              disabled={!day || !isAvailable}
            >
              {day && (
                <View style={[
                  styles.calendarDay,
                  isAvailable ? styles.calendarDayAvailable : undefined,
                  isBooked ? styles.calendarDayBooked : undefined,
                ]}>
                  <Text style={[
                    styles.calendarDayText,
                    isAvailable ? styles.calendarDayTextAvailable : undefined,
                  ]}>
                    {day}
                  </Text>
                  {isAvailable && !isBooked && (
                    <View style={styles.availableDot} />
                  )}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={styles.calendarLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDotAvailable]} />
          <Text style={styles.legendText}>Available</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDotBooked]} />
          <Text style={styles.legendText}>Booked</Text>
        </View>
      </View>
    </View>
  );

  const renderRequestsTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Reservation requests</Text>
      {sessionRequests.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Ionicons name="calendar-outline" size={48} color="#CCCCCC" />
          <Text style={styles.emptyStateText}>No requests yet</Text>
        </View>
      ) : null}
      {sessionRequests.map(request => (
        <View key={request.id} style={styles.requestCard}>
          <AvatarImage source={request.fan.avatar} size={48} />
          <View style={styles.requestInfo}>
            <Text style={styles.requestName}>{request.fan.name}</Text>
            <Text style={styles.requestMemberSince}>
              <Ionicons name="person-outline" size={11} color="#8E8E93" /> Member since {request.fan.memberSince}
            </Text>
            <Text style={styles.requestDetails}>
              <Ionicons name="calendar-outline" size={11} color="#8E8E93" /> {request.date} • {request.time}
            </Text>
            <Text style={styles.requestDuration}>
              <Ionicons name="time-outline" size={11} color="#8E8E93" /> {request.duration}-minute session
            </Text>
          </View>
          <View style={styles.requestStatus}>
            <Text style={[
              styles.requestStatusText,
              request.status === 'confirmed' && styles.statusConfirmed,
              request.status === 'pending' && styles.statusPending,
              request.status === 'rejected' && styles.statusRejected,
            ]}>
              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            </Text>
            {request.status === 'pending' && (
              <View style={styles.requestActions}>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => handleRequestAction(request.id, 'accept')}
                >
                  <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => handleRequestAction(request.id, 'reject')}
                >
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );

  const renderPacksTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.packsHeader}>
        <Text style={styles.sectionTitle}>My Packs</Text>
        <TouchableOpacity style={styles.createPackBtn} onPress={handleShowAddPackModal}>
          <Ionicons name="add" size={16} color={colors.primary} />
          <Text style={styles.createPackText}>Create a pack</Text>
        </TouchableOpacity>
      </View>

      {creatorPacks.length === 0 ? (
        <View style={styles.emptyStateContainer}>
          <Ionicons name="cube-outline" size={48} color="#CCCCCC" />
          <Text style={styles.emptyStateText}>No packs created yet</Text>
          <Text style={styles.emptyStateSubtext}>Create your first pack to get started</Text>
        </View>
      ) : null}

      {creatorPacks.map(pack => (
        <View key={pack.id} style={[styles.packCard, pack.isActive && styles.packCardActive]}>
          <View style={styles.packHeader}>
            <View style={styles.packNameRow}>
              <Text style={styles.packName}>{pack.name}</Text>
              {pack.isNew && <View style={styles.newBadge}><Text style={styles.newBadgeText}>New</Text></View>}
              {pack.isPopular && <View style={styles.popularBadge}><Text style={styles.popularBadgeText}>Popular</Text></View>}
            </View>
            <View style={styles.packToggle}>
              <Text style={styles.packToggleLabel}>{pack.isActive ? 'Active' : 'Inactive'}</Text>
              <Switch
                value={pack.isActive}
                onValueChange={() => handleTogglePackActive(pack.id, pack.isActive)}
                trackColor={{ false: '#E5E5E5', true: colors.primary }}
                thumbColor="white"
              />
            </View>
          </View>
          <View style={styles.packDetails}>
            <Text style={styles.packDetailText}>
              <Ionicons name="time-outline" size={14} color="#8E8E93" /> {pack.sessions} sessions / {pack.duration}min
            </Text>
            <Text style={styles.packDetailText}>
              <Ionicons name="calendar-outline" size={14} color="#8E8E93" /> Validity: {pack.validity} days from purchase
            </Text>
          </View>

          {/* Pack Offerings */}
          {pack.offerings && pack.offerings.length > 0 && (
            <View style={styles.packOfferingsSection}>
              <Text style={styles.packOfferingsTitle}>What's included:</Text>
              {pack.offerings.map(offering => (
                <View key={offering.id} style={styles.packOfferingItem}>
                  <Ionicons name={getOfferingIcon(offering.type) as keyof typeof Ionicons.glyphMap} size={16} color={colors.primary} />
                  <View style={styles.packOfferingInfo}>
                    <Text style={styles.packOfferingTitle}>{offering.title}</Text>
                    <Text style={styles.packOfferingDesc}>{offering.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.packPrice}>{formatCurrencyAmount(Math.round(pack.price * 100))}/month</Text>
          <View style={styles.packActions}>
            <TouchableOpacity style={styles.packEditBtn}>
              <Ionicons name="pencil-outline" size={16} color={colors.dark} />
              <Text style={styles.packEditText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.packDeleteBtn} onPress={() => handleDeletePack(pack.id)}>
              <Ionicons name="trash-outline" size={16} color="#FF3B30" />
              <Text style={styles.packDeleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
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
        <Text style={styles.headerTitle}>Private Sessions</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['calendar', 'requests', 'packs'] as TabType[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {activeTab === 'calendar' && renderCalendarTab()}
        {activeTab === 'requests' && renderRequestsTab()}
        {activeTab === 'packs' && renderPacksTab()}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Add Session Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCloseAddModal}>
              <Ionicons name="arrow-back" size={24} color={colors.dark} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Add a session</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Mode Toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, sessionMode === 'unique' && styles.modeBtnActive]}
                onPress={handleSessionModeUnique}
              >
                <Text style={[styles.modeBtnText, sessionMode === 'unique' && styles.modeBtnTextActive]}>
                  Unique session
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, sessionMode === 'range' && styles.modeBtnActive]}
                onPress={handleSessionModeRange}
              >
                <Text style={[styles.modeBtnText, sessionMode === 'range' && styles.modeBtnTextActive]}>
                  Session range
                </Text>
              </TouchableOpacity>
            </View>

            {/* Session Title */}
            <Text style={styles.inputLabel}>Session Title</Text>
            <TextInput
              style={styles.textInput}
              value={sessionTitle}
              onChangeText={setSessionTitle}
              placeholder="Enter session title"
            />

            {/* Date Selection */}
            {sessionMode === 'unique' ? (
              <>
                <Text style={styles.inputLabel}>Date</Text>
                <TouchableOpacity style={styles.dateInput}>
                  <Ionicons name="calendar-outline" size={20} color="#8E8E93" />
                  <Text style={styles.dateInputText}>
                    {sessionDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.dateRangeRow}>
                <View style={styles.dateRangeField}>
                  <Text style={styles.inputLabel}>Start Date</Text>
                  <TouchableOpacity style={styles.dateInput}>
                    <Ionicons name="calendar-outline" size={20} color="#8E8E93" />
                    <Text style={styles.dateInputText}>
                      {sessionDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.dateRangeField}>
                  <Text style={styles.inputLabel}>End Date</Text>
                  <TouchableOpacity style={styles.dateInput}>
                    <Ionicons name="calendar-outline" size={20} color="#8E8E93" />
                    <Text style={styles.dateInputText}>
                      {sessionEndDate.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Start Time */}
            <Text style={styles.inputLabel}>Start Time</Text>
            <TouchableOpacity style={styles.dateInput}>
              <Ionicons name="time-outline" size={20} color="#8E8E93" />
              <Text style={styles.dateInputText}>{sessionTime} PM</Text>
            </TouchableOpacity>

            {/* Days of Week (for range mode) */}
            {sessionMode === 'range' && (
              <>
                <Text style={styles.inputLabel}>Days of the Week</Text>
                <View style={styles.daysRow}>
                  {DAYS_OF_WEEK.map(day => (
                    <TouchableOpacity
                      key={day.key}
                      style={[styles.dayChip, selectedDays.includes(day.key) && styles.dayChipActive]}
                      onPress={() => toggleDay(day.key)}
                    >
                      <Text style={[styles.dayChipText, selectedDays.includes(day.key) && styles.dayChipTextActive]}>
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Duration */}
            <Text style={styles.inputLabel}>Duration</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map(dur => (
                <TouchableOpacity
                  key={dur}
                  style={[styles.durationChip, sessionDuration === dur && styles.durationChipActive]}
                  onPress={() => setSessionDuration(dur)}
                >
                  <Text style={[styles.durationChipText, sessionDuration === dur && styles.durationChipTextActive]}>
                    {dur} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Price */}
            <Text style={styles.inputLabel}>Price</Text>
            <View style={styles.priceInput}>
              <Ionicons name="logo-usd" size={20} color="#8E8E93" />
              <TextInput
                style={styles.priceInputText}
                value={sessionPrice}
                onChangeText={setSessionPrice}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={handleSaveSession}>
              <LinearGradient colors={GRADIENTS.primary} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Save</Text>
                <Ionicons name="save-outline" size={18} color="white" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCloseAddModal}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
              <Ionicons name="close" size={16} color={colors.dark} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add Pack Modal */}
      <Modal visible={showAddPackModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          style={styles.flex1}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCloseAddPackModal}>
              <Ionicons name="arrow-back" size={24} color={colors.dark} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Create a pack</Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.inputLabel}>Pack Name</Text>
            <TextInput
              style={styles.textInput}
              value={packName}
              onChangeText={setPackName}
              placeholder="e.g., Premium Pack"
            />

            <Text style={styles.inputLabel}>Number of Sessions</Text>
            <TextInput
              style={styles.textInput}
              value={packSessions}
              onChangeText={setPackSessions}
              keyboardType="numeric"
              placeholder="8"
            />

            <Text style={styles.inputLabel}>Session Duration</Text>
            <View style={styles.durationRow}>
              {DURATIONS.map(dur => (
                <TouchableOpacity
                  key={dur}
                  style={[styles.durationChip, packDuration === dur && styles.durationChipActive]}
                  onPress={() => setPackDuration(dur)}
                >
                  <Text style={[styles.durationChipText, packDuration === dur && styles.durationChipTextActive]}>
                    {dur} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Validity (days from purchase)</Text>
            <TextInput
              style={styles.textInput}
              value={packValidity}
              onChangeText={setPackValidity}
              keyboardType="numeric"
              placeholder="30"
            />
            <Text style={styles.validityNote}>
              <Ionicons name="information-circle-outline" size={12} color="#8E8E93" /> Validity period starts when the user purchases the pack
            </Text>

            {/* Pack Offerings Section */}
            <View style={styles.offeringsSection}>
              <View style={styles.offeringsHeader}>
                <Text style={styles.inputLabel}>What's Included</Text>
                <TouchableOpacity style={styles.addOfferingBtn} onPress={handleShowAddOfferingModal}>
                  <Ionicons name="add" size={18} color={colors.primary} />
                  <Text style={styles.addOfferingText}>Add</Text>
                </TouchableOpacity>
              </View>

              {packOfferings.length === 0 ? (
                <View style={styles.noOfferingsBox}>
                  <Ionicons name="gift-outline" size={32} color="#CCCCCC" />
                  <Text style={styles.noOfferingsText}>Add offerings to your pack</Text>
                  <Text style={styles.noOfferingsSubtext}>Training programs, diet plans, video access, etc.</Text>
                </View>
              ) : (
                <View style={styles.offeringsList}>
                  {packOfferings.map(offering => (
                    <View key={offering.id} style={styles.offeringItem}>
                      <Ionicons name={getOfferingIcon(offering.type) as keyof typeof Ionicons.glyphMap} size={20} color={colors.primary} />
                      <View style={styles.offeringItemInfo}>
                        <Text style={styles.offeringItemTitle}>{offering.title}</Text>
                        <Text style={styles.offeringItemDesc}>{offering.description}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveOffering(offering.id)}>
                        <Ionicons name="close-circle" size={22} color="#FF3B30" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <Text style={styles.inputLabel}>Price per Month ($)</Text>
            <View style={styles.priceInput}>
              <Ionicons name="logo-usd" size={20} color="#8E8E93" />
              <TextInput
                style={styles.priceInputText}
                value={packPrice}
                onChangeText={setPackPrice}
                keyboardType="numeric"
                placeholder="0"
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={handleSavePack}>
              <LinearGradient colors={['#0081BE', '#00B5C1']} style={styles.saveBtn}>
                <Text style={styles.saveBtnText}>Create Pack</Text>
                <Ionicons name="checkmark" size={18} color="white" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCloseAddPackModal}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
              <Ionicons name="close" size={16} color={colors.dark} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Date Slots Modal */}
      <Modal visible={showDateSlotsModal} animationType="slide" transparent>
        <View style={styles.slotsModalOverlay}>
          <View style={styles.slotsModalContent}>
            <View style={styles.slotsModalHeader}>
              <Text style={styles.slotsModalTitle}>
                Available Slots - {currentMonth.toLocaleDateString('en-US', { month: 'short' })} {selectedDate}
              </Text>
              <TouchableOpacity onPress={handleCloseDateSlotsModal}>
                <Ionicons name="close" size={24} color={colors.dark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.slotsModalBody} showsVerticalScrollIndicator={false}>
              {availableSlots.length === 0 ? (
                <View style={styles.emptyStateContainer}>
                  <Ionicons name="time-outline" size={48} color="#CCCCCC" />
                  <Text style={styles.emptyStateText}>No slots available</Text>
                </View>
              ) : null}
              {availableSlots.map((slot, index) => (
                <View key={index} style={[styles.slotItem, slot.isBooked && styles.slotItemBooked]}>
                  <View style={styles.slotTimeContainer}>
                    <Ionicons name="time-outline" size={18} color={slot.isBooked ? '#8E8E93' : colors.primary} />
                    <Text style={[styles.slotTime, slot.isBooked && styles.slotTimeBooked]}>{slot.time}</Text>
                  </View>
                  <View style={styles.slotDurationContainer}>
                    <Text style={styles.slotDuration}>{slot.duration} min</Text>
                  </View>
                  <View style={styles.slotStatusContainer}>
                    {slot.isBooked ? (
                      <View style={styles.bookedBadge}>
                        <Text style={styles.bookedBadgeText}>Booked</Text>
                      </View>
                    ) : (
                      <View style={styles.availableBadge}>
                        <Text style={styles.availableBadgeText}>Available</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.slotsModalClose} onPress={handleCloseDateSlotsModal}>
              <Text style={styles.slotsModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Offering Modal */}
      <Modal visible={showAddOfferingModal} animationType="fade" transparent>
        <View style={styles.offeringModalOverlay}>
          <View style={styles.offeringModalContent}>
            <View style={styles.offeringModalHeader}>
              <Text style={styles.offeringModalTitle}>Add Offering</Text>
              <TouchableOpacity onPress={handleCloseAddOfferingModal}>
                <Ionicons name="close" size={24} color={colors.dark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.offeringModalBody}>
              <Text style={styles.inputLabel}>Type</Text>
              <View style={styles.offeringTypesGrid}>
                {OFFERING_TYPES.map(type => (
                  <TouchableOpacity
                    key={type.key}
                    style={[styles.offeringTypeBtn, newOfferingType === type.key && styles.offeringTypeBtnActive]}
                    onPress={() => setNewOfferingType(type.key)}
                  >
                    <Ionicons name={type.icon as keyof typeof Ionicons.glyphMap} size={20} color={newOfferingType === type.key ? 'white' : colors.dark} />
                    <Text style={[styles.offeringTypeText, newOfferingType === type.key && styles.offeringTypeTextActive]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                value={newOfferingTitle}
                onChangeText={setNewOfferingTitle}
                placeholder="e.g., Custom Training Program"
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.textAreaInput]}
                value={newOfferingDesc}
                onChangeText={setNewOfferingDesc}
                placeholder="Describe what's included..."
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={styles.offeringModalFooter}>
              <TouchableOpacity style={styles.addOfferingConfirmBtn} onPress={handleAddOffering}>
                <Text style={styles.addOfferingConfirmText}>Add Offering</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '600', color: colors.dark },
  placeholder: { width: 40 },

  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.backgroundSecondary, alignItems: 'center' },
  tabActive: { backgroundColor: 'rgba(14, 191, 138, 0.15)' },
  tabText: { fontSize: 14, fontWeight: '500', color: '#8E8E93' },
  tabTextActive: { color: colors.primary, fontWeight: '600' },

  content: { flex: 1 },
  tabContent: { padding: 16 },

  // Calendar
  calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  viewToggle: { flexDirection: 'row', backgroundColor: colors.backgroundSecondary, borderRadius: 8, padding: 4 },
  viewToggleBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
  viewToggleBtnActive: { backgroundColor: colors.background, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  viewToggleText: { fontSize: 13, fontWeight: '500', color: '#8E8E93' },
  viewToggleTextActive: { color: colors.dark },
  addNewBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(14, 191, 138, 0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 4 },
  addNewText: { fontSize: 13, fontWeight: '600', color: colors.primary },

  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  monthTitle: { fontSize: 16, fontWeight: '600', color: colors.dark },

  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDayHeader: { width: '14.28%', textAlign: 'center', fontSize: 12, fontWeight: '500', color: '#8E8E93', marginBottom: 8 },
  calendarDayCell: { width: '14.28%', aspectRatio: 1, padding: 2 },
  calendarDay: { flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  calendarDayAvailable: { backgroundColor: 'rgba(14, 191, 138, 0.15)' },
  calendarDayBooked: { backgroundColor: colors.primary },
  calendarDayText: { fontSize: 14, fontWeight: '500', color: colors.dark },
  calendarDayTextAvailable: { color: colors.primary },
  availableDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.primary, marginTop: 2 },
  calendarLegend: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : '#F0F0F0' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 16, height: 16, borderRadius: 4 },
  legendText: { fontSize: 12, color: '#8E8E93' },

  // Requests
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.dark, marginBottom: 16 },
  requestCard: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, backgroundColor: colors.backgroundSecondary, borderRadius: 12, marginBottom: 12, gap: 12 },
  requestInfo: { flex: 1 },
  requestName: { fontSize: 16, fontWeight: '600', color: colors.dark },
  requestMemberSince: { fontSize: 11, color: '#8E8E93', marginTop: 4 },
  requestDetails: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  requestDuration: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  requestStatus: { alignItems: 'flex-end' },
  requestStatusText: { fontSize: 13, fontWeight: '600' },
  statusConfirmed: { color: colors.primary },
  statusPending: { color: '#FF9500' },
  statusRejected: { color: '#FF3B30' },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  acceptBtn: { backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  acceptBtnText: { fontSize: 13, fontWeight: '600', color: 'white' },
  rejectBtn: { backgroundColor: colors.background, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#E5E5E5' },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: '#FF3B30' },

  // Packs
  packsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  createPackBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 4 },
  createPackText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  packCard: { backgroundColor: colors.backgroundSecondary, borderRadius: 16, padding: 16, marginBottom: 16 },
  packCardActive: { backgroundColor: 'rgba(14, 191, 138, 0.08)', borderWidth: 1, borderColor: 'rgba(14, 191, 138, 0.3)' },
  packHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  packNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  packName: { fontSize: 17, fontWeight: '700', color: colors.dark },
  newBadge: { backgroundColor: '#FF9500', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  newBadgeText: { fontSize: 10, fontWeight: '700', color: 'white' },
  popularBadge: { backgroundColor: colors.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  popularBadgeText: { fontSize: 10, fontWeight: '700', color: 'white' },
  packToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  packToggleLabel: { fontSize: 12, color: '#8E8E93' },
  packDetails: { marginBottom: 8 },
  packDetailText: { fontSize: 13, color: '#8E8E93', marginBottom: 4 },
  packPrice: { fontSize: 20, fontWeight: '700', color: colors.dark, marginBottom: 12 },
  packActions: { flexDirection: 'row', gap: 12 },
  packEditBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingVertical: 12, borderRadius: 10, gap: 6, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#E5E5E5' },
  packEditText: { fontSize: 14, fontWeight: '500', color: colors.dark },
  packDeleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, paddingVertical: 12, borderRadius: 10, gap: 6, borderWidth: 1, borderColor: '#FFE5E5' },
  packDeleteText: { fontSize: 14, fontWeight: '500', color: '#FF3B30' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: colors.background },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: colors.dark },
  modalContent: { flex: 1, padding: 20 },
  modalFooter: { padding: 20, gap: 12 },

  modeToggle: { flexDirection: 'row', backgroundColor: colors.backgroundSecondary, borderRadius: 12, padding: 4, marginBottom: 24 },
  modeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modeBtnActive: { backgroundColor: colors.primary },
  modeBtnText: { fontSize: 14, fontWeight: '500', color: '#8E8E93' },
  modeBtnTextActive: { color: 'white', fontWeight: '600' },

  inputLabel: { fontSize: 13, fontWeight: '600', color: colors.dark, marginBottom: 8, marginTop: 16 },
  textInput: { borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#E5E5E5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.dark, backgroundColor: colors.background },
  dateInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#E5E5E5', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  dateInputText: { fontSize: 16, color: colors.dark },
  dateRangeRow: { flexDirection: 'row', gap: 12 },
  dateRangeField: { flex: 1 },

  daysRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.backgroundSecondary },
  dayChipActive: { backgroundColor: colors.primary },
  dayChipText: { fontSize: 13, fontWeight: '500', color: colors.dark },
  dayChipTextActive: { color: 'white' },

  durationRow: { flexDirection: 'row', gap: 10 },
  durationChip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.backgroundSecondary },
  durationChipActive: { backgroundColor: colors.primary },
  durationChipText: { fontSize: 14, fontWeight: '500', color: colors.dark },
  durationChipTextActive: { color: 'white' },

  priceInput: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#E5E5E5', borderRadius: 12, paddingHorizontal: 16, gap: 8 },
  priceInputText: { flex: 1, fontSize: 16, color: colors.dark, paddingVertical: 14 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 14, gap: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '600', color: 'white' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#E5E5E5', gap: 6 },
  cancelBtnText: { fontSize: 15, fontWeight: '500', color: colors.dark },

  // Pack Offerings
  packOfferingsSection: { marginTop: 12, marginBottom: 12, padding: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.8)', borderRadius: 10 },
  packOfferingsTitle: { fontSize: 13, fontWeight: '600', color: colors.dark, marginBottom: 8 },
  packOfferingItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  packOfferingInfo: { flex: 1 },
  packOfferingTitle: { fontSize: 13, fontWeight: '600', color: colors.dark },
  packOfferingDesc: { fontSize: 11, color: '#8E8E93', marginTop: 2 },

  // Validity Note
  validityNote: { fontSize: 12, color: '#8E8E93', marginTop: 6, fontStyle: 'italic' },

  // Offerings Section in Modal
  offeringsSection: { marginTop: 16 },
  offeringsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addOfferingBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(14, 191, 138, 0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 },
  addOfferingText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  noOfferingsBox: { alignItems: 'center', padding: 24, backgroundColor: colors.backgroundSecondary, borderRadius: 12, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.2)' : '#E5E5E5', borderStyle: 'dashed' },
  noOfferingsText: { fontSize: 14, fontWeight: '500', color: '#8E8E93', marginTop: 8 },
  noOfferingsSubtext: { fontSize: 12, color: '#AAAAAA', marginTop: 4 },
  offeringsList: { gap: 8 },
  offeringItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundSecondary, padding: 12, borderRadius: 10, gap: 12 },
  offeringItemInfo: { flex: 1 },
  offeringItemTitle: { fontSize: 14, fontWeight: '600', color: colors.dark },
  offeringItemDesc: { fontSize: 12, color: '#8E8E93', marginTop: 2 },

  // Date Slots Modal
  slotsModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  slotsModalContent: { backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  slotsModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : '#F0F0F0' },
  slotsModalTitle: { fontSize: 18, fontWeight: '700', color: colors.dark },
  slotsModalBody: { padding: 16 },
  slotItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.backgroundSecondary, borderRadius: 12, marginBottom: 10 },
  slotItemBooked: { backgroundColor: colors.backgroundSecondary, opacity: 0.7 },
  slotTimeContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  slotTime: { fontSize: 16, fontWeight: '600', color: colors.dark },
  slotTimeBooked: { color: '#8E8E93' },
  slotDurationContainer: { flex: 1 },
  slotDuration: { fontSize: 14, color: '#8E8E93' },
  slotStatusContainer: { flex: 1, alignItems: 'flex-end' },
  bookedBadge: { backgroundColor: '#FFE5E5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  bookedBadgeText: { fontSize: 12, fontWeight: '600', color: '#FF3B30' },
  availableBadge: { backgroundColor: 'rgba(14, 191, 138, 0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  availableBadgeText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  slotsModalClose: { padding: 20, alignItems: 'center', borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : '#F0F0F0' },
  slotsModalCloseText: { fontSize: 16, fontWeight: '600', color: colors.dark },

  // Add Offering Modal
  offeringModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  offeringModalContent: { backgroundColor: colors.background, borderRadius: 20, maxHeight: '80%' },
  offeringModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : '#F0F0F0' },
  offeringModalTitle: { fontSize: 18, fontWeight: '700', color: colors.dark },
  offeringModalBody: { padding: 20 },
  offeringTypesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  offeringTypeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.backgroundSecondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, gap: 6, marginBottom: 4 },
  offeringTypeBtnActive: { backgroundColor: colors.primary },
  offeringTypeText: { fontSize: 12, fontWeight: '500', color: colors.dark },
  offeringTypeTextActive: { color: 'white' },
  textAreaInput: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  offeringModalFooter: { padding: 20, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : '#F0F0F0' },
  addOfferingConfirmBtn: { backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  addOfferingConfirmText: { fontSize: 16, fontWeight: '600', color: 'white' },

  // Shared utility styles (extracted from inline)
  emptyStateContainer: { alignItems: 'center' as const, paddingVertical: 32 },
  emptyStateText: { color: '#8E8E93', marginTop: 12 },
  emptyStateSubtext: { color: '#AAAAAA', fontSize: 13, marginTop: 4 },
  loadingContainer: { flex: 1, backgroundColor: colors.background, justifyContent: 'center' as const, alignItems: 'center' as const },
  loadingText: { color: '#8E8E93', marginTop: 16 },
  bottomSpacer: { height: 40 },
  flex1: { flex: 1 },
  modalHeaderSpacer: { width: 24 },
  legendDotAvailable: { backgroundColor: 'rgba(14, 191, 138, 0.15)' },
  legendDotBooked: { backgroundColor: colors.primary },
});
