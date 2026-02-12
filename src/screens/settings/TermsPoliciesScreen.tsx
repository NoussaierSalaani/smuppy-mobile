import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSmuppyAlert } from '../../context/SmuppyAlertContext';


// Website base URL for legal pages
const WEBSITE_BASE_URL = 'https://smuppy.com';

// Policy links configuration
const POLICY_LINKS = [
  {
    id: 'terms',
    title: 'Terms of Service',
    description: 'Our terms for using Smuppy',
    url: `${WEBSITE_BASE_URL}/terms`,
    icon: 'document-text-outline' as const,
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    description: 'How we handle your data',
    url: `${WEBSITE_BASE_URL}/privacy`,
    icon: 'shield-checkmark-outline' as const,
  },
  {
    id: 'community',
    title: 'Community Guidelines',
    description: 'Rules for our community',
    url: `${WEBSITE_BASE_URL}/community-guidelines`,
    icon: 'people-outline' as const,
  },
  {
    id: 'content',
    title: 'Content Policy',
    description: 'What content is allowed',
    url: `${WEBSITE_BASE_URL}/content-policy`,
    icon: 'images-outline' as const,
  },
  {
    id: 'cookies',
    title: 'Cookie Policy',
    description: 'How we use cookies',
    url: `${WEBSITE_BASE_URL}/cookies`,
    icon: 'ellipse-outline' as const,
  },
];

interface TermsPoliciesScreenProps {
  navigation: { goBack: () => void };
}

const TermsPoliciesScreen = ({ navigation }: TermsPoliciesScreenProps) => {
  const insets = useSafeAreaInsets();
  const { showError } = useSmuppyAlert();

  const openLink = async (url: string, title: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        showError('Error', 'Failed to open link. Please check your internet connection.');
      }
    } catch {
      showError('Error', 'Failed to open link. Please try again later.');
    }
  };

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
        <Text style={styles.headerTitle}>Terms and Policies</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Important Notice */}
        <View style={styles.noticeBox}>
          <Ionicons name="information-circle" size={20} color="#0EBF8A" />
          <Text style={styles.noticeText}>
            By using Smuppy, you agree to all the policies below. Tap any item to read the full document on our website.
          </Text>
        </View>

        {/* Policy Links */}
        <View style={styles.linksContainer}>
          {POLICY_LINKS.map((policy) => (
            <TouchableOpacity
              key={policy.id}
              style={styles.linkItem}
              onPress={() => openLink(policy.url, policy.title)}
              activeOpacity={0.7}
            >
              <View style={styles.linkIconBox}>
                <Ionicons name={policy.icon} size={22} color="#0EBF8A" />
              </View>
              <View style={styles.linkContent}>
                <Text style={styles.linkTitle}>{policy.title}</Text>
                <Text style={styles.linkDescription}>{policy.description}</Text>
              </View>
              <Ionicons name="open-outline" size={20} color="#C7C7CC" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Contact Section */}
        <View style={styles.contactSection}>
          <Text style={styles.contactTitle}>Questions?</Text>
          <Text style={styles.contactText}>
            If you have any questions about our policies or wish to exercise your data rights, please contact us.
          </Text>
          <TouchableOpacity
            style={styles.contactButton}
            onPress={() => openLink('mailto:legal@smuppy.app', 'Email')}
          >
            <Ionicons name="mail-outline" size={18} color="#0EBF8A" />
            <Text style={styles.contactButtonText}>legal@smuppy.app</Text>
          </TouchableOpacity>
        </View>

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
    marginBottom: 24,
    gap: 12,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#0a252f',
    lineHeight: 20,
  },
  linksContainer: {
    gap: 12,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 14,
    padding: 16,
    gap: 14,
  },
  linkIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E6FAF8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkContent: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontFamily: 'WorkSans-SemiBold',
    color: '#0A0A0F',
    marginBottom: 2,
  },
  linkDescription: {
    fontSize: 13,
    fontFamily: 'Poppins-Regular',
    color: '#8E8E93',
  },
  contactSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#F2F2F2',
    alignItems: 'center',
  },
  contactTitle: {
    fontSize: 17,
    fontFamily: 'WorkSans-Bold',
    color: '#0A0A0F',
    marginBottom: 8,
  },
  contactText: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  contactButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: '#0EBF8A',
  },
  contactButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-Medium',
    color: '#0EBF8A',
  },
});

export default TermsPoliciesScreen;
