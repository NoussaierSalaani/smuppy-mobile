import 'dotenv/config';
export default {
expo: {
owner: 'nou09',
name: 'Smuppy',
slug: 'Smuppy',
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
infoPlist: {
ITSAppUsesNonExemptEncryption: false,
      },
    },
android: {
package: 'com.nou09.Smuppy',
adaptiveIcon: {
foregroundImage: './assets/icon.png',
backgroundColor: '#0A252F',
      },
edgeToEdgeEnabled: true,
permissions: [
'android.permission.RECORD_AUDIO',
'android.permission.MODIFY_AUDIO_SETTINGS',
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
],
extra: {
eas: {
projectId: 'f38cbb48-8255-45df-ab5b-097b70ee9fea',
      },
// Environment variables passed to the app
supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
googleApiKey: process.env.GOOGLE_API_KEY,
apiUrlDev: process.env.API_URL_DEV,
apiUrlProd: process.env.API_URL_PROD,
appEnv: process.env.APP_ENV || 'dev',
// Sentry for error tracking
sentryDsn: process.env.SENTRY_DSN,
// AWS S3 & CloudFront
awsRegion: process.env.AWS_REGION,
s3BucketName: process.env.S3_BUCKET_NAME,
cloudfrontUrl: process.env.CLOUDFRONT_URL,
    },
  },
};
