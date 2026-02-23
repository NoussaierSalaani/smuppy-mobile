const { execSync } = require('child_process');

const isDevBuild = (process.env.APP_ENV || 'dev') === 'dev' || process.env.EAS_BUILD_PROFILE === 'development';

// Google iOS reversed client ID — required for OAuth redirect in production builds
const googleIosClientId = process.env.GOOGLE_IOS_CLIENT_ID || '';
const googleReversedClientId = googleIosClientId
  ? googleIosClientId.split('.').reverse().join('.')
  : '';

// Capture git commit SHA at build time for provenance tracking
let gitCommitSha = 'unknown';
try {
  gitCommitSha = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
} catch {
  // Fallback if git is not available (e.g. CI without git)
}

export default {
expo: {
owner: 'nou09',
name: 'Smuppy',
slug: 'Smuppy',
scheme: 'smuppy',
version: '1.0.0',
orientation: 'portrait',
icon: './assets/icon.png',
userInterfaceStyle: 'light',
newArchEnabled: true,
updates: {
  url: 'https://u.expo.dev/f38cbb48-8255-45df-ab5b-097b70ee9fea',
},
runtimeVersion: {
  policy: 'appVersion',
},
splash: {
  image: './assets/Splashscreen.png',
  backgroundColor: '#0EBF8A',
  resizeMode: 'cover',
},
ios: {
supportsTablet: true,
bundleIdentifier: 'com.nou09.Smuppy',
buildNumber: '1',
runtimeVersion: {
  policy: 'appVersion',
},
usesAppleSignIn: true,
// Universal Links - associate app with web domain
associatedDomains: [
  'applinks:smuppy.com',
  'applinks:www.smuppy.com',
  'applinks:app.smuppy.com',
],
infoPlist: {
  // Google OAuth redirect: reversed client ID must be a URL scheme for auth callback
  ...(googleReversedClientId && {
    CFBundleURLTypes: [{ CFBundleURLSchemes: [googleReversedClientId] }],
  }),
  ITSAppUsesNonExemptEncryption: false,
  // ATS: restrict to specific domains instead of allowing all
  NSAppTransportSecurity: {
    NSAllowsLocalNetworking: true,
    // DEV ONLY: allow arbitrary loads for tunnel/Metro (stripped in production builds)
    ...(isDevBuild && {
      NSAllowsArbitraryLoads: true,
      NSAllowsArbitraryLoadsInWebContent: true,
    }),
    NSExceptionDomains: {
      'amazonaws.com': {
        NSIncludesSubdomains: true,
        NSExceptionAllowsInsecureHTTPLoads: false,
        NSExceptionRequiresForwardSecrecy: true,
        NSExceptionMinimumTLSVersion: 'TLSv1.2',
      },
      'cloudfront.net': {
        NSIncludesSubdomains: true,
        NSExceptionAllowsInsecureHTTPLoads: false,
        NSExceptionRequiresForwardSecrecy: true,
        NSExceptionMinimumTLSVersion: 'TLSv1.2',
      },
      'smuppy.com': {
        NSIncludesSubdomains: true,
        NSExceptionAllowsInsecureHTTPLoads: false,
        NSExceptionRequiresForwardSecrecy: true,
        NSExceptionMinimumTLSVersion: 'TLSv1.2',
      },
      // DEV ONLY: Expo tunnel, Metro dev server over HTTP
      ...(isDevBuild && {
        'exp.direct': {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSExceptionRequiresForwardSecrecy: false,
          NSExceptionMinimumTLSVersion: 'TLSv1.0',
        },
        localhost: {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSExceptionRequiresForwardSecrecy: false,
          NSExceptionMinimumTLSVersion: 'TLSv1.0',
        },
        '127.0.0.1': {
          NSIncludesSubdomains: true,
          NSExceptionAllowsInsecureHTTPLoads: true,
          NSExceptionRequiresForwardSecrecy: false,
          NSExceptionMinimumTLSVersion: 'TLSv1.0',
        },
      }),
    },
  },
  // Camera & Microphone for content creation
  NSCameraUsageDescription: 'Smuppy needs access to your camera to create posts, peaks, and update your profile photo.',
  NSMicrophoneUsageDescription: 'Smuppy needs access to your microphone to record voice messages and create video peaks.',
  // Photos & Location
  NSPhotoLibraryUsageDescription: 'Smuppy needs access to your photos to share content.',
  NSPhotoLibraryAddUsageDescription: 'Smuppy needs to save photos and videos to your library.',
  NSLocationWhenInUseUsageDescription: 'Smuppy uses your location to show nearby events, groups, and creators.',
  NSContactsUsageDescription: 'Smuppy can help you find friends from your contacts.',
  NSCalendarsUsageDescription: 'Smuppy can add your booked sessions and events to your calendar.',
  NSCalendarsFullAccessUsageDescription: 'Smuppy can add your booked sessions and events to your calendar.',
  NSCalendarsWriteOnlyAccessUsageDescription: 'Smuppy can add your booked sessions and events to your calendar.',
  // V4 DISABLED — Bluetooth (Agora live streaming/calls — re-enable when GO_LIVE/PRIVATE_SESSIONS go live)
  // NSBluetoothAlwaysUsageDescription: 'Smuppy uses Bluetooth to connect to audio devices during live streaming and video calls.',
},
    },
android: {
package: 'com.nou09.Smuppy',
adaptiveIcon: {
foregroundImage: './assets/icon.png',
backgroundColor: '#11E3A3',
      },
edgeToEdgeEnabled: true,
allowBackup: false,
permissions: [
'android.permission.RECORD_AUDIO',
'android.permission.MODIFY_AUDIO_SETTINGS',
'android.permission.CAMERA',
// V4 DISABLED — Bluetooth (re-enable when GO_LIVE/PRIVATE_SESSIONS go live)
// 'android.permission.BLUETOOTH',
// 'android.permission.BLUETOOTH_CONNECT',
],
// Android App Links - associate app with web domain
intentFilters: [
  {
    action: 'VIEW',
    autoVerify: true,
    data: [
      {
        scheme: 'https',
        host: 'smuppy.com',
        pathPrefix: '/',
      },
      {
        scheme: 'https',
        host: 'www.smuppy.com',
        pathPrefix: '/',
      },
      {
        scheme: 'https',
        host: 'app.smuppy.com',
        pathPrefix: '/',
      },
    ],
    category: ['BROWSABLE', 'DEFAULT'],
  },
],
    },
web: {
favicon: './assets/icon.png',
    },
plugins: [
'@react-native-community/datetimepicker',
'expo-audio',
'expo-font',
'expo-secure-store',
'expo-asset',
'expo-web-browser',
'@sentry/react-native',
'expo-apple-authentication',
'expo-notifications',
'expo-camera',
'expo-location',
'expo-image-picker',
'expo-contacts',
'expo-calendar',
'@rnmapbox/maps',
],
extra: {
eas: {
projectId: 'f38cbb48-8255-45df-ab5b-097b70ee9fea',
      },
// Environment variables passed to the app
googleApiKey: process.env.GOOGLE_API_KEY,
// Google OAuth Client IDs
googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID,
googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID,
googleWebClientId: process.env.GOOGLE_WEB_CLIENT_ID,
apiUrlDev: process.env.API_URL_DEV,
apiUrlProd: process.env.API_URL_PROD,
appEnv: process.env.APP_ENV || 'dev',
// Agora for live streaming
agoraAppId: process.env.AGORA_APP_ID,
// AWS S3 & CloudFront (legacy keys — kept for env.ts backwards compat)
awsRegion: process.env.AWS_REGION,
s3BucketName: process.env.S3_BUCKET_NAME,
cloudfrontUrl: process.env.CLOUDFRONT_URL,
// AWS Config (EXPO_PUBLIC_* vars — used by aws-config.ts)
// Baked into extra so they survive Expo's static env replacement at build time
expoPublicAwsRegion: process.env.EXPO_PUBLIC_AWS_REGION,
expoPublicCognitoUserPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID,
expoPublicCognitoClientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID,
expoPublicCognitoIdentityPoolId: process.env.EXPO_PUBLIC_COGNITO_IDENTITY_POOL_ID,
expoPublicApiRestEndpoint: process.env.EXPO_PUBLIC_API_REST_ENDPOINT,
expoPublicApiRestEndpoint2: process.env.EXPO_PUBLIC_API_REST_ENDPOINT_2,
expoPublicApiRestEndpoint3: process.env.EXPO_PUBLIC_API_REST_ENDPOINT_3,
expoPublicApiRestEndpointDisputes: process.env.EXPO_PUBLIC_API_REST_ENDPOINT_DISPUTES,
expoPublicApiGraphqlEndpoint: process.env.EXPO_PUBLIC_API_GRAPHQL_ENDPOINT,
expoPublicApiWebsocketEndpoint: process.env.EXPO_PUBLIC_API_WEBSOCKET_ENDPOINT,
expoPublicS3Bucket: process.env.EXPO_PUBLIC_S3_BUCKET,
expoPublicCdnDomain: process.env.EXPO_PUBLIC_CDN_DOMAIN,
expoPublicDynamodbFeedTable: process.env.EXPO_PUBLIC_DYNAMODB_FEED_TABLE,
expoPublicDynamodbLikesTable: process.env.EXPO_PUBLIC_DYNAMODB_LIKES_TABLE,
expoPublicEnv: process.env.EXPO_PUBLIC_ENV,
// Sentry
sentryDsn: process.env.SENTRY_DSN,
// Mapbox
mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
// Build provenance (injected at build time)
gitCommitSha,
easBuildProfile: process.env.EAS_BUILD_PROFILE || 'local',
    },
  },
};
