/**
 * Environment Configuration Tests
 * Tests for ENV config structure and values.
 */

// Define __DEV__ before imports
(global as Record<string, unknown>).__DEV__ = true;

// Mock expo-constants
jest.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.2.3',
    extra: {
      googleApiKey: 'test-google-key',
      googleIosClientId: 'test-ios-client',
      googleAndroidClientId: 'test-android-client',
      googleWebClientId: 'test-web-client',
      awsRegion: 'us-east-1',
      s3BucketName: 'test-bucket',
      cloudfrontUrl: 'https://cdn.test.com',
      agoraAppId: 'test-agora-id',
      mapboxAccessToken: 'pk.test-mapbox',
      sentryDsn: 'https://test@sentry.io/123',
      appEnv: 'development',
    },
  },
  manifest: null,
  manifest2: null,
}));

import { ENV } from '../../config/env';

describe('ENV Config', () => {
  it('should have GOOGLE_API_KEY from extra', () => {
    expect(ENV.GOOGLE_API_KEY).toBe('test-google-key');
  });

  it('should have Google OAuth client IDs', () => {
    expect(ENV.GOOGLE_IOS_CLIENT_ID).toBe('test-ios-client');
    expect(ENV.GOOGLE_ANDROID_CLIENT_ID).toBe('test-android-client');
    expect(ENV.GOOGLE_WEB_CLIENT_ID).toBe('test-web-client');
  });

  it('should have AWS configuration', () => {
    expect(ENV.AWS_REGION).toBe('us-east-1');
    expect(ENV.S3_BUCKET_NAME).toBe('test-bucket');
    expect(ENV.CLOUDFRONT_URL).toBe('https://cdn.test.com');
  });

  it('should have Agora app ID', () => {
    expect(ENV.AGORA_APP_ID).toBe('test-agora-id');
  });

  it('should have Mapbox access token', () => {
    expect(ENV.MAPBOX_ACCESS_TOKEN).toBe('pk.test-mapbox');
  });

  it('should have Sentry DSN', () => {
    expect(ENV.SENTRY_DSN).toBe('https://test@sentry.io/123');
  });

  it('should have app environment', () => {
    expect(ENV.APP_ENV).toBe('development');
  });

  it('should have app version from expoConfig', () => {
    expect(ENV.APP_VERSION).toBe('1.2.3');
    expect(ENV.appVersion).toBe('1.2.3');
  });

  it('should have isDev property', () => {
    expect(typeof ENV.isDev).toBe('boolean');
  });

  it('should have ENFORCE_HTTPS as boolean', () => {
    expect(typeof ENV.ENFORCE_HTTPS).toBe('boolean');
  });

  it('should have API_URL as a string', () => {
    expect(typeof ENV.API_URL).toBe('string');
    expect(ENV.API_URL.length).toBeGreaterThan(0);
  });
});
