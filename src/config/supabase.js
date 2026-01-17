import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import { ENV } from './env';

/**
 * Supabase client configuration
 * Returns a mock client if env vars are missing to prevent crashes
 */

// Check if Supabase is properly configured
const isConfigured = Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY);

// Mock client for when Supabase is not configured
const mockError = { message: 'Supabase not configured - missing SUPABASE_URL or SUPABASE_ANON_KEY' };

const mockSupabase = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: mockError }),
    getUser: () => Promise.resolve({ data: { user: null }, error: mockError }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signOut: () => Promise.resolve({ error: mockError }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: mockError }),
    signUp: () => Promise.resolve({ data: { user: null, session: null }, error: mockError }),
    resetPasswordForEmail: () => Promise.resolve({ error: mockError }),
    updateUser: () => Promise.resolve({ data: { user: null }, error: mockError }),
  },
  from: () => ({
    select: () => ({ data: null, error: mockError, eq: () => ({ data: null, error: mockError, single: () => Promise.resolve({ data: null, error: mockError }), maybeSingle: () => Promise.resolve({ data: null, error: mockError }) }) }),
    insert: () => Promise.resolve({ data: null, error: mockError }),
    update: () => ({ eq: () => Promise.resolve({ data: null, error: mockError }) }),
    delete: () => ({ eq: () => Promise.resolve({ data: null, error: mockError }) }),
    upsert: () => Promise.resolve({ data: null, error: mockError }),
  }),
  rpc: () => Promise.resolve({ data: null, error: mockError }),
  functions: {
    invoke: () => Promise.resolve({ data: null, error: mockError }),
  },
  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: null, error: mockError }),
      download: () => Promise.resolve({ data: null, error: mockError }),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
      remove: () => Promise.resolve({ data: null, error: mockError }),
    }),
  },
  channel: () => ({
    on: function() { return this; },
    subscribe: () => ({ unsubscribe: () => {} }),
    unsubscribe: () => {},
  }),
};

// Create real client only if configured, otherwise use mock
let supabase;

if (isConfigured) {
  supabase = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
} else {
  supabase = mockSupabase;
  // Log warning (will show in Xcode/Android Studio logs)
  console.warn('[Supabase] Using mock client - SUPABASE_URL or SUPABASE_ANON_KEY missing');
}

export { supabase };
