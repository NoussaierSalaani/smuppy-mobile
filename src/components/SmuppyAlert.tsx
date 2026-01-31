import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ALERT_WIDTH = Math.min(SCREEN_WIDTH - 48, 340);

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'confirm';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface SmuppyAlertConfig {
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
}

interface SmuppyAlertProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
}

const SmuppyAlert: React.FC<SmuppyAlertProps> = ({
  visible,
  onClose,
  title,
  message,
  type = 'info',
  buttons = [{ text: 'OK' }],
}) => {
  const { colors, gradients } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const ICON_MAP: Record<AlertType, { name: string; color: string }> = {
    success: { name: 'checkmark-circle', color: colors.primary },
    error: { name: 'close-circle', color: colors.error },
    warning: { name: 'warning', color: '#FF9500' },
    info: { name: 'information-circle', color: '#007AFF' },
    confirm: { name: 'help-circle', color: '#007AFF' },
  };

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.8);
      opacityAnim.setValue(0);
    }
  }, [visible, scaleAnim, opacityAnim]);

  const iconConfig = ICON_MAP[type];

  const handleButtonPress = (button: AlertButton) => {
    onClose();
    if (button.onPress) {
      setTimeout(() => button.onPress?.(), 100);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.darkGray },
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: iconConfig.color + '1A' }]}>
            <Ionicons name={iconConfig.name as keyof typeof Ionicons.glyphMap} size={40} color={iconConfig.color} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.white }]}>{title}</Text>

          {/* Message */}
          {message ? <Text style={styles.message}>{message}</Text> : null}

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            {buttons.map((button, index) => {
              const isDestructive = button.style === 'destructive';
              const isCancel = button.style === 'cancel';
              const isPrimary = !isDestructive && !isCancel && buttons.length > 1 && index === buttons.length - 1;
              const isSingleDefault = buttons.length === 1 && !isDestructive && !isCancel;

              if (isPrimary || isSingleDefault) {
                return (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.8}
                    onPress={() => handleButtonPress(button)}
                    style={styles.buttonPrimary}
                  >
                    <LinearGradient
                      colors={[...gradients.button]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={[styles.buttonTextPrimary, { color: colors.white }]}>{button.text}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              }

              if (isDestructive) {
                return (
                  <TouchableOpacity
                    key={index}
                    activeOpacity={0.8}
                    onPress={() => handleButtonPress(button)}
                    style={styles.buttonPrimary}
                  >
                    <LinearGradient
                      colors={[colors.error, '#FF6B6B']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buttonGradient}
                    >
                      <Text style={[styles.buttonTextPrimary, { color: colors.white }]}>{button.text}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                );
              }

              return (
                <TouchableOpacity
                  key={index}
                  activeOpacity={0.7}
                  onPress={() => handleButtonPress(button)}
                  style={styles.buttonSecondary}
                >
                  <Text style={styles.buttonTextSecondary}>{button.text}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: ALERT_WIDTH,
    borderRadius: 20,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  iconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: 'WorkSans-Bold',
    fontSize: 20,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#AEAEB2',
    textAlign: 'center',
    marginBottom: 20,
  },
  buttonsContainer: {
    width: '100%',
    gap: 10,
    marginTop: 4,
  },
  buttonPrimary: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  buttonGradient: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonTextPrimary: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
  },
  buttonSecondary: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#6E6E73',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonTextSecondary: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: '#AEAEB2',
  },
});

export default SmuppyAlert;
