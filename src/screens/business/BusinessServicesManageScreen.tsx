/**
 * BusinessServicesManageScreen
 * CRUD for services and products with pricing
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useCurrency } from '../../hooks/useCurrency';
import type { IconName } from '../../types';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

interface Props {
  navigation: { navigate: (screen: string, params?: Record<string, unknown>) => void; goBack: () => void };
}

interface Service {
  id: string;
  name: string;
  description?: string;
  category: string;
  price_cents: number;
  duration_minutes?: number;
  is_subscription: boolean;
  subscription_period?: 'weekly' | 'monthly' | 'yearly';
  trial_days?: number;
  is_active: boolean;
  max_capacity?: number;
  image_url?: string;
}

interface ServiceCategory {
  id: string;
  name: string;
  icon: IconName;
  color: string;
}

const SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: 'session', name: 'Single Session', icon: 'ticket', color: '#FF6B35' },
  { id: 'class', name: 'Class/Course', icon: 'people', color: '#9B59B6' },
  { id: 'membership', name: 'Membership', icon: 'card', color: '#0EBF8A' },
  { id: 'pack', name: 'Session Pack', icon: 'albums', color: '#3498DB' },
  { id: 'product', name: 'Product', icon: 'cube', color: '#FFD93D' },
  { id: 'rental', name: 'Equipment Rental', icon: 'bicycle', color: '#E74C3C' },
];

const SUBSCRIPTION_PERIODS = [
  { id: 'weekly', label: 'Weekly', multiplier: 1 },
  { id: 'monthly', label: 'Monthly', multiplier: 4 },
  { id: 'yearly', label: 'Yearly', multiplier: 48 },
];

export default function BusinessServicesManageScreen({ navigation }: Props) {
  const { showError, showDestructiveConfirm } = useSmuppyAlert();
  const { formatAmount, currency } = useCurrency();
  const { colors, isDark } = useTheme();

  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('session');
  const [formPrice, setFormPrice] = useState('');
  const [formDuration, setFormDuration] = useState('');
  const [formIsSubscription, setFormIsSubscription] = useState(false);
  const [formSubscriptionPeriod, setFormSubscriptionPeriod] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [formTrialDays, setFormTrialDays] = useState('');
  const [formMaxCapacity, setFormMaxCapacity] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  useEffect(() => {
    loadServices();
  }, []);

  const loadServices = async () => {
    try {
      const response = await awsAPI.getBusinessServices('current');

      if (response.success) {
        setServices((response.services || []) as unknown as Service[]);
      } else {
        setServices([]);
      }
    } catch (error) {
      if (__DEV__) console.warn('Load services error:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadServices();
  }, []);

  const resetForm = () => {
    setFormName('');
    setFormDescription('');
    setFormCategory('session');
    setFormPrice('');
    setFormDuration('');
    setFormIsSubscription(false);
    setFormSubscriptionPeriod('monthly');
    setFormTrialDays('');
    setFormMaxCapacity('');
    setFormIsActive(true);
    setEditingService(null);
  };

  const handleAddNew = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetForm();
    setShowModal(true);
  };

  const handleEdit = (service: Service) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingService(service);
    setFormName(service.name);
    setFormDescription(service.description || '');
    setFormCategory(service.category);
    setFormPrice((service.price_cents / 100).toString());
    setFormDuration(service.duration_minutes?.toString() || '');
    setFormIsSubscription(service.is_subscription);
    setFormSubscriptionPeriod(service.subscription_period || 'monthly');
    setFormTrialDays(service.trial_days?.toString() || '');
    setFormMaxCapacity(service.max_capacity?.toString() || '');
    setFormIsActive(service.is_active);
    setShowModal(true);
  };

  const handleDelete = (service: Service) => {
    showDestructiveConfirm(
      'Delete Service',
      `Are you sure you want to delete "${service.name}"?`,
      async () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        try {
          await awsAPI.deleteBusinessService(service.id);
          setServices((prev) => prev.filter((s) => s.id !== service.id));
        } catch (_error) {
          showError('Error', 'Failed to delete service');
        }
      },
      'Delete'
    );
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      showError('Error', 'Service name is required');
      return;
    }

    if (!formPrice || isNaN(parseFloat(formPrice))) {
      showError('Error', 'Valid price is required');
      return;
    }

    setIsSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const serviceData = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
        category: formCategory,
        price_cents: Math.round(parseFloat(formPrice) * 100),
        duration_minutes: formDuration ? parseInt(formDuration) : undefined,
        is_subscription: formIsSubscription,
        subscription_period: formIsSubscription ? formSubscriptionPeriod : undefined,
        trial_days: formTrialDays ? parseInt(formTrialDays) : undefined,
        max_capacity: formMaxCapacity ? parseInt(formMaxCapacity) : undefined,
        is_active: formIsActive,
      };

      if (editingService) {
        const response = await awsAPI.updateBusinessService(editingService.id, serviceData);
        if (response.success) {
          setServices((prev) =>
            prev.map((s) => (s.id === editingService.id ? { ...s, ...serviceData } : s))
          );
        }
      } else {
        const response = await awsAPI.createBusinessService(serviceData);
        if (response.success && response.service) {
          setServices((prev) => [...prev, response.service as unknown as Service]);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
      resetForm();
    } catch (error) {
      if (__DEV__) console.warn('Save service error:', error);
      showError('Error', 'Failed to save service');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (service: Service) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await awsAPI.updateBusinessService(service.id, { is_active: !service.is_active });
      setServices((prev) =>
        prev.map((s) => (s.id === service.id ? { ...s, is_active: !s.is_active } : s))
      );
    } catch (error) {
      if (__DEV__) console.warn('Toggle active error:', error);
    }
  };

  const getCategoryInfo = (categoryId: string) => {
    return SERVICE_CATEGORIES.find((c) => c.id === categoryId) || SERVICE_CATEGORIES[0];
  };

  const renderServiceItem = (service: Service) => {
    const category = getCategoryInfo(service.category);

    return (
      <TouchableOpacity
        key={service.id}
        style={[styles.serviceCard, !service.is_active && styles.serviceCardInactive]}
        onPress={() => handleEdit(service)}
        activeOpacity={0.8}
      >
        <View style={[styles.serviceIcon, { backgroundColor: `${category.color}20` }]}>
          <Ionicons name={category.icon} size={24} color={category.color} />
        </View>

        <View style={styles.serviceInfo}>
          <View style={styles.serviceHeader}>
            <Text style={styles.serviceName}>{service.name}</Text>
            {service.is_subscription && (
              <View style={styles.subscriptionBadge}>
                <Text style={styles.subscriptionBadgeText}>Recurring</Text>
              </View>
            )}
          </View>

          {service.description && (
            <Text style={styles.serviceDescription} numberOfLines={1}>
              {service.description}
            </Text>
          )}

          <View style={styles.serviceMeta}>
            <Text style={styles.servicePrice}>
              {formatAmount(service.price_cents)}
              {service.is_subscription && `/${service.subscription_period?.slice(0, 2)}`}
            </Text>
            {service.duration_minutes && (
              <View style={styles.serviceMetaItem}>
                <Ionicons name="time-outline" size={14} color={colors.gray} />
                <Text style={styles.serviceMetaText}>{service.duration_minutes} min</Text>
              </View>
            )}
            {service.max_capacity && (
              <View style={styles.serviceMetaItem}>
                <Ionicons name="people-outline" size={14} color={colors.gray} />
                <Text style={styles.serviceMetaText}>Max {service.max_capacity}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.serviceActions}>
          <Switch
            value={service.is_active}
            onValueChange={() => handleToggleActive(service)}
            trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(14,191,138,0.4)' }}
            thumbColor={service.is_active ? colors.primary : colors.gray}
          />
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(service)}
          >
            <Ionicons name="trash-outline" size={18} color={colors.heartRed} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.backgroundSecondary, colors.background]} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Services & Products</Text>
          <TouchableOpacity onPress={handleAddNew} style={styles.addButton}>
            <Ionicons name="add" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Stats Summary */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{services.length}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {services.filter((s) => s.is_active).length}
              </Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#9B59B6' }]}>
                {services.filter((s) => s.is_subscription).length}
              </Text>
              <Text style={styles.statLabel}>Subscriptions</Text>
            </View>
          </View>

          {/* Services List */}
          <View style={styles.servicesList}>
            {services.map(renderServiceItem)}

            {services.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="pricetags-outline" size={48} color={colors.gray} />
                <Text style={styles.emptyTitle}>No services yet</Text>
                <Text style={styles.emptySubtitle}>Add your first service or product</Text>
                <TouchableOpacity style={styles.emptyButton} onPress={handleAddNew}>
                  <LinearGradient colors={GRADIENTS.primary} style={styles.emptyButtonGradient}>
                    <Ionicons name="add" size={20} color={colors.dark} />
                    <Text style={styles.emptyButtonText}>Add Service</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Add/Edit Modal */}
        <Modal visible={showModal} animationType="slide" transparent>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <BlurView intensity={80} tint="dark" style={styles.modalBlur}>
                  {/* Modal Header */}
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {editingService ? 'Edit Service' : 'New Service'}
                    </Text>
                    <TouchableOpacity onPress={() => setShowModal(false)}>
                      <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                    {/* Name */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Name *</Text>
                      <TextInput
                        style={styles.formInput}
                        value={formName}
                        onChangeText={setFormName}
                        placeholder="Service name"
                        placeholderTextColor={colors.gray}
                      />
                    </View>

                    {/* Description */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Description</Text>
                      <TextInput
                        style={[styles.formInput, styles.formInputMultiline]}
                        value={formDescription}
                        onChangeText={setFormDescription}
                        placeholder="Brief description"
                        placeholderTextColor={colors.gray}
                        multiline
                        numberOfLines={3}
                      />
                    </View>

                    {/* Category */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Category</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.categoryPicker}>
                          {SERVICE_CATEGORIES.map((cat) => (
                            <TouchableOpacity
                              key={cat.id}
                              style={[
                                styles.categoryOption,
                                formCategory === cat.id && { borderColor: cat.color },
                              ]}
                              onPress={() => {
                                setFormCategory(cat.id);
                                if (cat.id === 'membership') {
                                  setFormIsSubscription(true);
                                }
                              }}
                            >
                              <Ionicons
                                name={cat.icon}
                                size={20}
                                color={formCategory === cat.id ? cat.color : colors.gray}
                              />
                              <Text
                                style={[
                                  styles.categoryOptionText,
                                  formCategory === cat.id && { color: cat.color },
                                ]}
                              >
                                {cat.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </ScrollView>
                    </View>

                    {/* Price */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Price ({currency.symbol}) *</Text>
                      <TextInput
                        style={styles.formInput}
                        value={formPrice}
                        onChangeText={setFormPrice}
                        placeholder="0.00"
                        placeholderTextColor={colors.gray}
                        keyboardType="decimal-pad"
                      />
                    </View>

                    {/* Duration (for sessions/classes) */}
                    {['session', 'class', 'rental'].includes(formCategory) && (
                      <View style={styles.formGroup}>
                        <Text style={styles.formLabel}>Duration (minutes)</Text>
                        <TextInput
                          style={styles.formInput}
                          value={formDuration}
                          onChangeText={setFormDuration}
                          placeholder="60"
                          placeholderTextColor={colors.gray}
                          keyboardType="number-pad"
                        />
                      </View>
                    )}

                    {/* Max Capacity (for classes) */}
                    {formCategory === 'class' && (
                      <View style={styles.formGroup}>
                        <Text style={styles.formLabel}>Max Capacity</Text>
                        <TextInput
                          style={styles.formInput}
                          value={formMaxCapacity}
                          onChangeText={setFormMaxCapacity}
                          placeholder="15"
                          placeholderTextColor={colors.gray}
                          keyboardType="number-pad"
                        />
                      </View>
                    )}

                    {/* Subscription Toggle */}
                    <View style={styles.formGroupRow}>
                      <View style={styles.formGroupRowInfo}>
                        <Text style={styles.formLabel}>Recurring Payment</Text>
                        <Text style={styles.formHint}>Enable for memberships</Text>
                      </View>
                      <Switch
                        value={formIsSubscription}
                        onValueChange={setFormIsSubscription}
                        trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(14,191,138,0.4)' }}
                        thumbColor={formIsSubscription ? colors.primary : colors.gray}
                      />
                    </View>

                    {/* Subscription Options */}
                    {formIsSubscription && (
                      <>
                        <View style={styles.formGroup}>
                          <Text style={styles.formLabel}>Billing Period</Text>
                          <View style={styles.periodPicker}>
                            {SUBSCRIPTION_PERIODS.map((period) => (
                              <TouchableOpacity
                                key={period.id}
                                style={[
                                  styles.periodOption,
                                  formSubscriptionPeriod === period.id && styles.periodOptionSelected,
                                ]}
                                onPress={() => setFormSubscriptionPeriod(period.id as 'weekly' | 'monthly' | 'yearly')}
                              >
                                <Text
                                  style={[
                                    styles.periodOptionText,
                                    formSubscriptionPeriod === period.id && styles.periodOptionTextSelected,
                                  ]}
                                >
                                  {period.label}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>

                        <View style={styles.formGroup}>
                          <Text style={styles.formLabel}>Free Trial Days</Text>
                          <TextInput
                            style={styles.formInput}
                            value={formTrialDays}
                            onChangeText={setFormTrialDays}
                            placeholder="0"
                            placeholderTextColor={colors.gray}
                            keyboardType="number-pad"
                          />
                        </View>
                      </>
                    )}

                    {/* Active Toggle */}
                    <View style={styles.formGroupRow}>
                      <View style={styles.formGroupRowInfo}>
                        <Text style={styles.formLabel}>Active</Text>
                        <Text style={styles.formHint}>Visible to customers</Text>
                      </View>
                      <Switch
                        value={formIsActive}
                        onValueChange={setFormIsActive}
                        trackColor={{ false: 'rgba(255,255,255,0.1)', true: 'rgba(14,191,138,0.4)' }}
                        thumbColor={formIsActive ? colors.primary : colors.gray}
                      />
                    </View>

                    <View style={{ height: 20 }} />
                  </ScrollView>

                  {/* Save Button */}
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSave}
                    disabled={isSaving}
                  >
                    <LinearGradient colors={GRADIENTS.primary} style={styles.saveGradient}>
                      {isSaving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.saveButtonText}>
                          {editingService ? 'Update Service' : 'Create Service'}
                        </Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </BlurView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (colors: ThemeColors, _isDark: boolean) => StyleSheet.create({
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
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.gray,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },

  // Services List
  servicesList: {
    gap: 12,
  },
  serviceCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
  },
  serviceCardInactive: {
    opacity: 0.5,
  },
  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  subscriptionBadge: {
    backgroundColor: 'rgba(155,89,182,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  subscriptionBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9B59B6',
  },
  serviceDescription: {
    fontSize: 13,
    color: colors.gray,
    marginBottom: 6,
  },
  serviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  servicePrice: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  serviceMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  serviceMetaText: {
    fontSize: 12,
    color: colors.gray,
  },
  serviceActions: {
    alignItems: 'center',
    gap: 8,
  },
  deleteButton: {
    padding: 8,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.dark,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.gray,
  },
  emptyButton: {
    marginTop: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.dark,
  },

  // Modal
  modalContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '90%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  modalBlur: {
    backgroundColor: 'rgba(20,20,35,0.95)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  modalScroll: {
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: 500,
  },

  // Form
  formGroup: {
    marginBottom: 20,
  },
  formGroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    borderRadius: 14,
  },
  formGroupRowInfo: {
    flex: 1,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 8,
  },
  formHint: {
    fontSize: 12,
    color: colors.gray,
    marginTop: -4,
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.dark,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  formInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Category Picker
  categoryPicker: {
    flexDirection: 'row',
    gap: 10,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 8,
  },
  categoryOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.gray,
  },

  // Period Picker
  periodPicker: {
    flexDirection: 'row',
    gap: 10,
  },
  periodOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  periodOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(14,191,138,0.1)',
  },
  periodOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.gray,
  },
  periodOptionTextSelected: {
    color: colors.primary,
  },

  // Save Button
  saveButton: {
    marginHorizontal: 20,
    marginVertical: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  saveGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
  },
});
