import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TermsPoliciesScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

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
        <Text style={styles.headerTitle}>Terms and policies</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Terms of Service</Text>
        <Text style={styles.paragraph}>
          Welcome to Smuppy. By accessing or using our application, you agree to be bound by these Terms of Service and all applicable laws and regulations.
        </Text>

        <Text style={styles.sectionTitle}>Privacy Policy</Text>
        <Text style={styles.paragraph}>
          Your privacy is important to us. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application.
        </Text>

        <Text style={styles.sectionTitle}>User Content</Text>
        <Text style={styles.paragraph}>
          You retain ownership of any content you submit, post, or display on or through Smuppy. By posting content, you grant us a license to use, modify, and display that content.
        </Text>

        <Text style={styles.sectionTitle}>Community Guidelines</Text>
        <Text style={styles.paragraph}>
          We want Smuppy to be a safe and positive environment for everyone. Please be respectful of others and do not post content that is harmful, offensive, or violates others' rights.
        </Text>

        <Text style={styles.sectionTitle}>Account Security</Text>
        <Text style={styles.paragraph}>
          You are responsible for maintaining the security of your account and password. Smuppy cannot and will not be liable for any loss or damage from your failure to comply with this security obligation.
        </Text>

        <Text style={styles.sectionTitle}>Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We reserve the right to modify these terms at any time. We will notify users of any material changes by posting the new Terms of Service on this page.
        </Text>

        <Text style={styles.sectionTitle}>Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have any questions about these Terms, please contact us at support@smuppy.app
        </Text>

        <Text style={styles.lastUpdated}>Last updated: January 2026</Text>
        
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
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
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'WorkSans-Bold',
    color: '#0A0A0F',
    marginBottom: 12,
    marginTop: 20,
  },
  paragraph: {
    fontSize: 15,
    fontFamily: 'Poppins-Regular',
    color: '#6E6E73',
    lineHeight: 24,
  },
  lastUpdated: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: '#C7C7CC',
    textAlign: 'center',
    marginTop: 32,
  },
});

export default TermsPoliciesScreen;