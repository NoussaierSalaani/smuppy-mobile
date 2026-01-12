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
        {/* Important Notice */}
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle" size={20} color="#00cdb5" />
          <Text style={styles.noticeText}>
            By creating an account, you confirm that you have read and agree to all the documents below.
          </Text>
        </View>

        <Text style={styles.sectionTitle}>1. Terms of Service</Text>
        <Text style={styles.paragraph}>
          Welcome to Smuppy. By creating an account and using our application, you expressly consent to be bound by these Terms of Service, our Privacy Policy, Community Guidelines, and all applicable laws and regulations. Your continued use of the app constitutes acceptance of these terms.
        </Text>

        <Text style={styles.sectionTitle}>2. User Consent & Account Creation</Text>
        <Text style={styles.paragraph}>
          By creating an account on Smuppy, you acknowledge and consent to the following:{'\n\n'}
          • You are at least 16 years of age{'\n'}
          • You have read and understood these Terms of Service{'\n'}
          • You have read and understood our Privacy Policy{'\n'}
          • You have read and understood our Community Guidelines{'\n'}
          • You consent to the collection and processing of your data as described in our Privacy Policy{'\n'}
          • You agree to receive notifications related to your account and activity
        </Text>

        <Text style={styles.sectionTitle}>3. Privacy Policy</Text>
        <Text style={styles.paragraph}>
          Your privacy is important to us. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our mobile application. Please read this policy carefully. By using Smuppy, you consent to the data practices described in this policy.
        </Text>

        <Text style={styles.sectionTitle}>4. Data Collection & Processing</Text>
        <Text style={styles.paragraph}>
          We collect personal information that you voluntarily provide when registering, including:{'\n\n'}
          • Email address and account credentials{'\n'}
          • Profile information (name, photo, interests){'\n'}
          • Activity data and usage statistics{'\n'}
          • Device information and location (if permitted){'\n\n'}
          This data is processed to provide our services, improve user experience, and ensure platform security.
        </Text>

        <Text style={styles.sectionTitle}>5. User Content</Text>
        <Text style={styles.paragraph}>
          You retain ownership of any content you submit, post, or display on or through Smuppy. By posting content, you grant us a worldwide, non-exclusive, royalty-free license to use, modify, and display that content for the purpose of operating and improving our services.
        </Text>

        <Text style={styles.sectionTitle}>6. Community Guidelines</Text>
        <Text style={styles.paragraph}>
          We want Smuppy to be a safe and positive environment for everyone. By using our platform, you agree to:{'\n\n'}
          • Be respectful of other users{'\n'}
          • Not post harmful, offensive, or illegal content{'\n'}
          • Not harass, bully, or discriminate against others{'\n'}
          • Not share false or misleading information{'\n'}
          • Report violations to our support team
        </Text>

        <Text style={styles.sectionTitle}>7. Account Security</Text>
        <Text style={styles.paragraph}>
          You are responsible for maintaining the security of your account and password. Smuppy cannot and will not be liable for any loss or damage from your failure to comply with this security obligation. You must notify us immediately of any unauthorized access.
        </Text>

        <Text style={styles.sectionTitle}>8. Changes to Terms</Text>
        <Text style={styles.paragraph}>
          We reserve the right to modify these terms at any time. We will notify users of any material changes by email or in-app notification. Your continued use after changes constitutes acceptance of the new terms.
        </Text>

        <Text style={styles.sectionTitle}>9. Contact Us</Text>
        <Text style={styles.paragraph}>
          If you have any questions about these Terms or wish to exercise your data rights, please contact us at:{'\n\n'}
          Email: support@smuppy.app{'\n'}
          Legal: legal@smuppy.app
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
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E6FAF8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#0a252f',
    lineHeight: 20,
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