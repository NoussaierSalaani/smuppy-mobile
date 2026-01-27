/**
 * Pack Purchase Success Screen
 * Confirmation screen after successful pack purchase
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { DARK_COLORS as COLORS } from '../../config/theme';

interface Pack {
  id: string;
  name: string;
  sessionsIncluded: number;
  sessionDuration: number;
  validityDays: number;
  price: number;
}

interface Creator {
  id: string;
  name: string;
  username: string;
}

type RouteParams = {
  PackPurchaseSuccess: { pack: Pack; creator: Creator };
};

const PackPurchaseSuccessScreen = (): React.JSX.Element => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'PackPurchaseSuccess'>>();
  const { pack, creator } = route.params;

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        damping: 10,
        stiffness: 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleBookNow = () => {
    navigation.replace('BookSession', { creatorId: creator.id, fromPack: true });
  };

  const handleViewSessions = () => {
    navigation.replace('MySessions');
  };

  const handleGoHome = () => {
    navigation.replace('Tabs');
  };

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + pack.validityDays);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {/* Success Animation */}
        <Animated.View style={[styles.successIcon, { transform: [{ scale: scaleAnim }] }]}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Ionicons name="checkmark" size={60} color={COLORS.white} />
          </LinearGradient>
        </Animated.View>

        <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
          <Text style={styles.title}>Achat réussi !</Text>
          <Text style={styles.subtitle}>
            Vous avez acheté le {pack.name} avec {creator.name}
          </Text>

          {/* Pack Summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Ionicons name="cube" size={22} color={COLORS.primary} />
              <Text style={styles.summaryText}>{pack.name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="videocam" size={22} color={COLORS.primary} />
              <Text style={styles.summaryText}>{pack.sessionsIncluded} sessions disponibles</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="time" size={22} color={COLORS.primary} />
              <Text style={styles.summaryText}>{pack.sessionDuration} min/session</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="calendar" size={22} color={COLORS.primary} />
              <Text style={styles.summaryText}>
                Expire le {expiryDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
              </Text>
            </View>
          </View>

          {/* Info */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={COLORS.primary} />
            <Text style={styles.infoText}>
              Vous pouvez réserver vos sessions à tout moment depuis le profil de {creator.name}.
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Actions */}
      <Animated.View style={[styles.actions, { paddingBottom: insets.bottom + 16, opacity: fadeAnim }]}>
        <TouchableOpacity style={styles.primaryButton} onPress={handleBookNow}>
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.buttonGradient}
          >
            <Ionicons name="calendar" size={20} color={COLORS.white} />
            <Text style={styles.primaryButtonText}>Réserver une session</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleViewSessions}>
          <Text style={styles.secondaryButtonText}>Voir mes sessions</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={handleGoHome}>
          <Text style={styles.linkButtonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  successIcon: {
    marginBottom: 32,
  },
  iconGradient: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.lightGray,
    textAlign: 'center',
    marginBottom: 32,
  },
  summaryCard: {
    width: '100%',
    backgroundColor: COLORS.darkGray,
    borderRadius: 16,
    padding: 20,
    gap: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  summaryText: {
    fontSize: 15,
    color: COLORS.white,
    flex: 1,
  },
  infoCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: COLORS.primary + '15',
    borderRadius: 12,
    padding: 14,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.lightGray,
    lineHeight: 20,
  },
  actions: {
    paddingHorizontal: 24,
    gap: 12,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  linkButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkButtonText: {
    fontSize: 15,
    color: COLORS.gray,
  },
});

export default PackPurchaseSuccessScreen;
