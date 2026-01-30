import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import SmuppyAlert, { type SmuppyAlertConfig } from '../components/SmuppyAlert';

interface SmuppyAlertAPI {
  showAlert: (config: SmuppyAlertConfig) => void;
  showSuccess: (title: string, message?: string) => void;
  showError: (title: string, message?: string) => void;
  showWarning: (title: string, message?: string) => void;
  showConfirm: (title: string, message: string, onConfirm: () => void, confirmText?: string) => void;
  showDestructiveConfirm: (title: string, message: string, onConfirm: () => void, confirmText?: string) => void;
}

const SmuppyAlertContext = createContext<SmuppyAlertAPI | null>(null);

export function SmuppyAlertProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<SmuppyAlertConfig>({ title: '' });

  const hide = useCallback(() => {
    setVisible(false);
  }, []);

  const showAlert = useCallback((cfg: SmuppyAlertConfig) => {
    setConfig(cfg);
    setVisible(true);
  }, []);

  const showSuccess = useCallback((title: string, message?: string) => {
    showAlert({ title, message, type: 'success', buttons: [{ text: 'OK' }] });
  }, [showAlert]);

  const showError = useCallback((title: string, message?: string) => {
    showAlert({ title, message, type: 'error', buttons: [{ text: 'OK' }] });
  }, [showAlert]);

  const showWarning = useCallback((title: string, message?: string) => {
    showAlert({ title, message, type: 'warning', buttons: [{ text: 'OK' }] });
  }, [showAlert]);

  const showConfirm = useCallback((title: string, message: string, onConfirm: () => void, confirmText = 'Confirm') => {
    showAlert({
      title,
      message,
      type: 'confirm',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: confirmText, onPress: onConfirm },
      ],
    });
  }, [showAlert]);

  const showDestructiveConfirm = useCallback((title: string, message: string, onConfirm: () => void, confirmText = 'Delete') => {
    showAlert({
      title,
      message,
      type: 'warning',
      buttons: [
        { text: 'Cancel', style: 'cancel' },
        { text: confirmText, style: 'destructive', onPress: onConfirm },
      ],
    });
  }, [showAlert]);

  const api = useMemo<SmuppyAlertAPI>(() => ({
    showAlert,
    showSuccess,
    showError,
    showWarning,
    showConfirm,
    showDestructiveConfirm,
  }), [showAlert, showSuccess, showError, showWarning, showConfirm, showDestructiveConfirm]);

  return (
    <SmuppyAlertContext.Provider value={api}>
      {children}
      <SmuppyAlert
        visible={visible}
        onClose={hide}
        title={config.title}
        message={config.message}
        type={config.type}
        buttons={config.buttons}
      />
    </SmuppyAlertContext.Provider>
  );
}

export function useSmuppyAlert(): SmuppyAlertAPI {
  const ctx = useContext(SmuppyAlertContext);
  if (!ctx) {
    throw new Error('useSmuppyAlert must be used within SmuppyAlertProvider');
  }
  return ctx;
}
