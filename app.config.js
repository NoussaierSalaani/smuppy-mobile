import 'dotenv/config';
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
splash: {
  image: './assets/icon.png',
  backgroundColor: '#0A252F',
  resizeMode: 'contain',
},
ios: {
supportsTablet: true,
bundleIdentifier: 'com.nou09.Smuppy',
usesAppleSignIn: true,
infoPlist: {
  ITSAppUsesNonExemptEncryption: false,
  // Allow network requests (required for AWS API Gateway)
  NSAppTransportSecurity: {
    NSAllowsArbitraryLoads: true,
    NSAllowsLocalNetworking: true,
  },
  // Camera & Microphone for live streaming
  NSCameraUsageDescription: 'Smuppy needs access to your camera for live streaming and video calls.',
  NSMicrophoneUsageDescription: 'Smuppy needs access to your microphone for live streaming and video calls.',
},
    },
android: {
package: 'com.nou09.Smuppy',
adaptiveIcon: {
foregroundImage: './assets/icon.png',
backgroundColor: '#11E3A3',
      },
edgeToEdgeEnabled: true,
permissions: [
'android.permission.RECORD_AUDIO',
'android.permission.MODIFY_AUDIO_SETTINGS',
'android.permission.CAMERA',
'android.permission.BLUETOOTH',
'android.permission.BLUETOOTH_CONNECT',
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
// Sentry for error tracking
sentryDsn: process.env.SENTRY_DSN,
// Agora for live streaming
agoraAppId: process.env.AGORA_APP_ID,
// AWS S3 & CloudFront
awsRegion: process.env.AWS_REGION,
s3BucketName: process.env.S3_BUCKET_NAME,
cloudfrontUrl: process.env.CLOUDFRONT_URL,
    },
  },
};
