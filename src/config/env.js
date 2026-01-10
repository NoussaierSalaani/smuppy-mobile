import Constants from 'expo-constants';

const ENV_CONFIG = {
  dev: { API_URL: 'http://localhost:3000/api', SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
  staging: { API_URL: 'https://staging-api.smuppy.com', SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
  prod: { API_URL: 'https://api.smuppy.com', SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
};

const getEnv = () => {
  const env = Constants.expoConfig?.extra?.env || 'dev';
  return ENV_CONFIG[env] || ENV_CONFIG.dev;
};

export const ENV = {
  ...getEnv(),
  isDev: __DEV__,
  appVersion: Constants.expoConfig?.version || '1.0.0',
};