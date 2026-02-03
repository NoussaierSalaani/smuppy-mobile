import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

// Allowed domains for WebView navigation
const ALLOWED_DOMAINS = [
  'smuppy.com',
  'www.smuppy.com',
  'app.smuppy.com',
  'stripe.com',
  'checkout.stripe.com',
  'm.stripe.network',
  'js.stripe.com',
  'hooks.stripe.com',
  'apple.com',
  'appleid.apple.com',
  'accounts.google.com',
  'support.google.com',
];

const isUrlAllowed = (url: string): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // Only allow HTTPS
    if (parsed.protocol !== 'https:') return false;
    // Check against whitelist
    return ALLOWED_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
};

export default function WebViewScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { colors } = useTheme();
  const { url, title } = route.params || {};

  const isAllowed = useMemo(() => isUrlAllowed(url), [url]);

  if (!isAllowed) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="close" size={24} color={colors.dark} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.dark }]}>Error</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={48} color={colors.gray} />
          <Text style={[styles.errorText, { color: colors.dark }]}>
            This URL is not allowed
          </Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={[styles.errorLink, { color: colors.primary }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="close" size={24} color={colors.dark} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.dark }]} numberOfLines={1}>
          {title || 'Loading...'}
        </Text>
        <View style={styles.backButton} />
      </View>
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        startInLoadingState
        javaScriptEnabled
        originWhitelist={['https://*']}
        onShouldStartLoadWithRequest={(request) => isUrlAllowed(request.url)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backButton: { width: 40, alignItems: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  webview: { flex: 1 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  errorText: { fontSize: 16, fontWeight: '500' },
  errorLink: { fontSize: 14, fontWeight: '600' },
});
