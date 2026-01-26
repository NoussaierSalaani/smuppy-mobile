import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface SmuppyAlertProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  type?: AlertType;
  buttons?: AlertButton[];
}

const getIconConfig = (type: AlertType) => {
  switch (type) {
    case 'success':
      return { name: 'checkmark-circle', color: '#0EBF8A', bgColor: 'rgba(14, 191, 138, 0.1)' };
    case 'error':
      return { name: 'close-circle', color: '#FF3B30', bgColor: 'rgba(255, 59, 48, 0.1)' };
    case 'warning':
      return { name: 'warning', color: '#FF9500', bgColor: 'rgba(255, 149, 0, 0.1)' };
    case 'info':
    default:
      return { name: 'information-circle', color: '#007AFF', bgColor: 'rgba(0, 122, 255, 0.1)' };
  }
};

const SmuppyAlert: React.FC<SmuppyAlertProps> = ({
  visible,
  onClose,
  title,
  message,
  type = 'info',
  buttons = [{ text: 'OK', style: 'default' }],
}) => {
  const iconConfig = getIconConfig(type);

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
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.container}>
              {/* Icon */}
              <View style={[styles.iconContainer, { backgroundColor: iconConfig.bgColor }]}>
                <Ionicons name={iconConfig.name as any} size={40} color={iconConfig.color} />
              </View>

              {/* Title */}
              <Text style={styles.title}>{title}</Text>

              {/* Message */}
              {message && <Text style={styles.message}>{message}</Text>}

              {/* Buttons */}
              <View style={styles.buttonsContainer}>
                {buttons.map((button, index) => {
                  const isDestructive = button.style === 'destructive';
                  const isCancel = button.style === 'cancel';
                  const isPrimary = !isDestructive && !isCancel && buttons.length > 1 && index === buttons.length - 1;

                  if (isPrimary) {
                    return (
                      <TouchableOpacity
                        key={index}
                        activeOpacity={0.8}
                        onPress={() => handleButtonPress(button)}
                        style={styles.buttonPrimary}
                      >
                        <LinearGradient
                          colors={['#0EBF8A', '#00B5C1']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.buttonGradient}
                        >
                          <Text style={styles.buttonTextPrimary}>{button.text}</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={index}
                      activeOpacity={0.7}
                      onPress={() => handleButtonPress(button)}
                      style={[
                        styles.button,
                        isDestructive && styles.buttonDestructive,
                        isCancel && styles.buttonCancel,
                      ]}
                    >
                      <Text
                        style={[
                          styles.buttonText,
                          isDestructive && styles.buttonTextDestructive,
                          isCancel && styles.buttonTextCancel,
                        ]}
                      >
                        {button.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// Hook for easy usage
export const useSmuppyAlert = () => {
  const [config, setConfig] = React.useState<{
    visible: boolean;
    title: string;
    message?: string;
    type?: AlertType;
    buttons?: AlertButton[];
  }>({
    visible: false,
    title: '',
  });

  const show = (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    type?: AlertType
  ) => {
    setConfig({
      visible: true,
      title,
      message,
      type: type || 'info',
      buttons: buttons || [{ text: 'OK' }],
    });
  };

  const hide = () => {
    setConfig(prev => ({ ...prev, visible: false }));
  };

  const success = (title: string, message?: string) => {
    show(title, message, [{ text: 'OK' }], 'success');
  };

  const error = (title: string, message?: string) => {
    show(title, message, [{ text: 'OK' }], 'error');
  };

  const warning = (title: string, message?: string) => {
    show(title, message, [{ text: 'OK' }], 'warning');
  };

  const confirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    confirmText = 'Confirm',
    destructive = false
  ) => {
    show(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
      ],
      destructive ? 'warning' : 'info'
    );
  };

  return {
    ...config,
    show,
    hide,
    success,
    error,
    warning,
    confirm,
    alertProps: {
      visible: config.visible,
      onClose: hide,
      title: config.title,
      message: config.message,
      type: config.type,
      buttons: config.buttons,
    },
  };
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
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
    fontSize: 18,
    fontWeight: '700',
    color: '#0A252F',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#6E6E73',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonsContainer: {
    width: '100%',
    gap: 10,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  buttonDestructive: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  buttonCancel: {
    backgroundColor: 'transparent',
  },
  buttonPrimary: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  buttonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A252F',
  },
  buttonTextDestructive: {
    color: '#FF3B30',
  },
  buttonTextCancel: {
    color: '#8E8E93',
  },
  buttonTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default SmuppyAlert;
