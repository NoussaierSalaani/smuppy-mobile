/**
 * BusinessScannerScreen
 * For business owners to scan member QR codes for access validation
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';
import { GRADIENTS } from '../../config/theme';
import { awsAPI } from '../../services/aws-api';
import { useTheme, type ThemeColors } from '../../hooks/useTheme';

const { width, height: _height } = Dimensions.get('window');
const SCAN_AREA_SIZE = width * 0.7;

interface Props {
  navigation: any;
}

interface ValidationResult {
  valid: boolean;
  memberName: string;
  membershipType: string;
  subscriptionId: string;
  validUntil: string;
  remainingSessions?: number;
  message?: string;
  photo?: string;
}

export default function BusinessScannerScreen({ navigation }: Props) {
  const { showAlert } = useSmuppyAlert();
  const { colors, isDark } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [scanHistory, setScanHistory] = useState<ValidationResult[]>([]);

  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const resultScaleAnim = useRef(new Animated.Value(0)).current;

  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  const scanAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (isScanning) {
      scanAnimRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      );
      scanAnimRef.current.start();
    } else if (scanAnimRef.current) {
      scanAnimRef.current.stop();
      scanAnimRef.current = null;
    }
    return () => {
      if (scanAnimRef.current) {
        scanAnimRef.current.stop();
        scanAnimRef.current = null;
      }
    };
  }, [isScanning]);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (!isScanning || isValidating) return;

    setIsScanning(false);
    setIsValidating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Parse QR data
      let qrData;
      try {
        qrData = JSON.parse(data);
      } catch {
        throw new Error('Invalid QR code format');
      }

      if (qrData.type !== 'smuppy_access') {
        throw new Error('This is not a valid Smuppy access code');
      }

      // Validate with backend
      const response = await awsAPI.validateMemberAccess({
        subscriptionId: qrData.subscriptionId,
        businessId: qrData.businessId,
        userId: qrData.userId,
      });

      if (response.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const result: ValidationResult = {
          valid: response.valid,
          memberName: response.memberName,
          membershipType: response.membershipType,
          subscriptionId: qrData.subscriptionId,
          validUntil: response.validUntil,
          remainingSessions: response.remainingSessions,
          photo: response.photo,
        };
        setValidationResult(result);
        setScanHistory((prev) => [result, ...prev.slice(0, 9)]);

        // Log entry
        await awsAPI.logMemberEntry({
          subscriptionId: qrData.subscriptionId,
          businessId: qrData.businessId,
        });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setValidationResult({
          valid: false,
          memberName: response.memberName || 'Unknown',
          membershipType: response.membershipType || 'N/A',
          subscriptionId: qrData.subscriptionId,
          validUntil: '',
          message: response.message || 'Access denied',
        });
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setValidationResult({
        valid: false,
        memberName: 'Error',
        membershipType: '',
        subscriptionId: '',
        validUntil: '',
        message: error.message || 'Failed to validate access',
      });
    } finally {
      setIsValidating(false);
      setShowResult(true);
      Animated.spring(resultScaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleScanAgain = () => {
    resultScaleAnim.setValue(0);
    setShowResult(false);
    setValidationResult(null);
    setIsScanning(true);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <LinearGradient colors={[colors.backgroundSecondary, colors.background]} style={StyleSheet.absoluteFill} />
        <SafeAreaView style={styles.permissionContent}>
          <View style={styles.permissionIcon}>
            <Ionicons name="camera" size={64} color={colors.primary} />
          </View>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            To scan member QR codes, we need access to your camera
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <LinearGradient colors={GRADIENTS.primary} style={styles.permissionGradient}>
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCAN_AREA_SIZE - 4],
  });

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        onBarcodeScanned={isScanning && !isValidating ? handleBarCodeScanned : undefined}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        {/* Top */}
        <View style={styles.overlayTop} />

        {/* Middle row with scan area */}
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />

          {/* Scan Area */}
          <View style={styles.scanArea}>
            {/* Corner brackets */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Scan line */}
            {isScanning && (
              <Animated.View
                style={[
                  styles.scanLine,
                  { transform: [{ translateY: scanLineTranslate }] },
                ]}
              />
            )}

            {/* Validating indicator */}
            {isValidating && (
              <View style={styles.validatingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.validatingText}>Validating...</Text>
              </View>
            )}
          </View>

          <View style={styles.overlaySide} />
        </View>

        {/* Bottom */}
        <View style={styles.overlayBottom}>
          <Text style={styles.instructionText}>
            Position the QR code within the frame
          </Text>
        </View>
      </View>

      {/* Header */}
      <SafeAreaView style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Access Code</Text>
        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => showAlert({ title: 'Scan History', message: `${scanHistory.length} entries today`, buttons: [{ text: 'OK' }] })}
        >
          <Ionicons name="time-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Result Modal */}
      <Modal visible={showResult} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.resultCard,
              { transform: [{ scale: resultScaleAnim }] },
            ]}
          >
            <BlurView intensity={80} tint="dark" style={styles.resultBlur}>
              {/* Status Icon */}
              <View
                style={[
                  styles.resultIconContainer,
                  { backgroundColor: validationResult?.valid ? 'rgba(14,191,138,0.2)' : 'rgba(255,107,107,0.2)' },
                ]}
              >
                <Ionicons
                  name={validationResult?.valid ? 'checkmark-circle' : 'close-circle'}
                  size={64}
                  color={validationResult?.valid ? colors.primary : '#FF6B6B'}
                />
              </View>

              {/* Status Text */}
              <Text style={[styles.resultStatus, { color: validationResult?.valid ? colors.primary : '#FF6B6B' }]}>
                {validationResult?.valid ? 'Access Granted' : 'Access Denied'}
              </Text>

              {/* Member Info */}
              {validationResult && (
                <View style={styles.memberDetails}>
                  <Text style={styles.memberName}>{validationResult.memberName}</Text>
                  <Text style={styles.membershipBadge}>{validationResult.membershipType}</Text>

                  {validationResult.valid && (
                    <View style={styles.validityInfo}>
                      <View style={styles.validityItem}>
                        <Ionicons name="calendar-outline" size={16} color={colors.gray} />
                        <Text style={styles.validityText}>
                          Valid until {formatDate(validationResult.validUntil)}
                        </Text>
                      </View>
                      {validationResult.remainingSessions !== undefined && (
                        <View style={styles.validityItem}>
                          <Ionicons name="ticket-outline" size={16} color={colors.gray} />
                          <Text style={styles.validityText}>
                            {validationResult.remainingSessions} sessions remaining
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {validationResult.message && !validationResult.valid && (
                    <Text style={styles.errorMessage}>{validationResult.message}</Text>
                  )}
                </View>
              )}

              {/* Actions */}
              <View style={styles.resultActions}>
                <TouchableOpacity style={styles.scanAgainButton} onPress={handleScanAgain}>
                  <LinearGradient
                    colors={validationResult?.valid ? GRADIENTS.primary : ['#FF6B6B', '#FF8E8E']}
                    style={styles.scanAgainGradient}
                  >
                    <Ionicons name="scan" size={20} color="#fff" />
                    <Text style={styles.scanAgainText}>Scan Next</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </BlurView>
          </Animated.View>
        </View>
      </Modal>

      {/* Quick Stats Footer */}
      <SafeAreaView style={styles.footer} edges={['bottom']}>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{scanHistory.length}</Text>
            <Text style={styles.statLabel}>Scans Today</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {scanHistory.filter((s) => s.valid).length}
            </Text>
            <Text style={styles.statLabel}>Successful</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
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
    backgroundColor: colors.background,
  },

  // Permission
  permissionContainer: {
    flex: 1,
  },
  permissionContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  permissionIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${colors.primary}26`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 12,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  permissionButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  permissionGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
  },
  cancelText: {
    fontSize: 15,
    color: colors.gray,
    paddingVertical: 12,
  },

  // Overlay
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  overlayMiddle: {
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    paddingTop: 24,
  },
  instructionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },

  // Scan Area
  scanArea: {
    width: SCAN_AREA_SIZE,
    height: SCAN_AREA_SIZE,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: colors.primary,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  scanLine: {
    position: 'absolute',
    left: 8,
    right: 8,
    height: 2,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  validatingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  validatingText: {
    fontSize: 14,
    color: colors.dark,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.dark,
  },
  historyButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Result Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  resultCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 28,
    overflow: 'hidden',
  },
  resultBlur: {
    backgroundColor: 'rgba(20,20,35,0.95)',
    padding: 28,
    alignItems: 'center',
  },
  resultIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  resultStatus: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 20,
  },
  memberDetails: {
    alignItems: 'center',
    width: '100%',
  },
  memberName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.dark,
    marginBottom: 8,
  },
  membershipBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    backgroundColor: `${colors.primary}26`,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 16,
  },
  validityInfo: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  validityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  validityText: {
    fontSize: 14,
    color: colors.grayLight,
  },
  errorMessage: {
    fontSize: 14,
    color: '#FF6B6B',
    textAlign: 'center',
    marginTop: 8,
  },
  resultActions: {
    width: '100%',
    marginTop: 24,
  },
  scanAgainButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  scanAgainGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  scanAgainText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.dark,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.7)',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.dark,
  },
  statLabel: {
    fontSize: 12,
    color: colors.gray,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
});
