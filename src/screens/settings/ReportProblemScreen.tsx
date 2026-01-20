import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ReportProblemScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [problemText, setProblemText] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleSend = () => {
    if (problemText.trim().length === 0) return;
    
    // TODO: Send report to backend
    setShowSuccessModal(true);
  };

  const handleSuccessClose = () => {
    setShowSuccessModal(false);
    navigation.goBack();
  };

  const renderSuccessModal = () => (
    <Modal
      visible={showSuccessModal}
      transparent
      animationType="fade"
      onRequestClose={handleSuccessClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={60} color="#0EBF8A" />
          </View>
          <Text style={styles.successTitle}>Problem Report Sent Successfully!</Text>
          <Text style={styles.successMessage}>
            Thank you for your feedback. We've received your report and will address the issue as soon as possible.
          </Text>
          <TouchableOpacity 
            style={styles.okButton}
            onPress={handleSuccessClose}
          >
            <Text style={styles.okButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#0A0A0F" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Report problem</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Text Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="Describe your problem here in details and we will get back to you soon."
              placeholderTextColor="#C7C7CC"
              multiline
              value={problemText}
              onChangeText={setProblemText}
              maxLength={1000}
              textAlignVertical="top"
            />
          </View>

          {/* Send Button */}
          <TouchableOpacity 
            style={[
              styles.sendButton,
              problemText.trim().length === 0 && styles.sendButtonDisabled
            ]}
            onPress={handleSend}
            disabled={problemText.trim().length === 0}
          >
            <Text style={styles.sendButtonText}>Send it</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {renderSuccessModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'WorkSans-SemiBold',
    color: '#0A0A0F',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // Input
  inputContainer: {
    flex: 1,
    marginBottom: 20,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F8F8F8',
    borderRadius: 16,
    padding: 16,
    fontSize: 15,
    fontFamily: 'Poppins-Regular',
    color: '#0A0A0F',
    lineHeight: 22,
  },

  // Send Button
  sendButton: {
    backgroundColor: '#0EBF8A',
    paddingVertical: 16,
    borderRadius: 28,
    alignItems: 'center',
    marginBottom: 20,
  },
  sendButtonDisabled: {
    backgroundColor: '#E8E8E8',
  },
  sendButtonText: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFF',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  successIcon: {
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 18,
    fontFamily: 'WorkSans-Bold',
    color: '#0A0A0F',
    textAlign: 'center',
    marginBottom: 12,
  },
  successMessage: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  okButton: {
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 25,
  },
  okButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#FFF',
  },
});

export default ReportProblemScreen;