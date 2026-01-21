import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import { ENV } from './env';

/**
 * Supabase client configuration
 * Returns a mock client if env vars are missing to prevent crashes
 */

// Check if Supabase is properly configured
const isConfigured = Boolean(ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY);

// Mock error for unconfigured state
const mockError = { message: 'Supabase not configured - missing SUPABASE_URL or SUPABASE_ANON_KEY' };

// Mock subscription object
const mockSubscription = { unsubscribe: () => {} };

// Mock client type that mirrors SupabaseClient interface for safety
interface MockSupabaseClient {
  auth: {
    getSession: () => Promise<{ data: { session: null }; error: typeof mockError }>;
    getUser: () => Promise<{ data: { user: null }; error: typeof mockError }>;
    onAuthStateChange: () => { data: { subscription: typeof mockSubscription } };
    signOut: () => Promise<{ error: typeof mockError }>;
    signInWithPassword: () => Promise<{ data: { user: null; session: null }; error: typeof mockError }>;
    signUp: () => Promise<{ data: { user: null; session: null }; error: typeof mockError }>;
    resetPasswordForEmail: () => Promise<{ error: typeof mockError }>;
    updateUser: () => Promise<{ data: { user: null }; error: typeof mockError }>;
    verifyOtp: () => Promise<{ data: { user: null; session: null }; error: typeof mockError }>;
    resend: () => Promise<{ error: typeof mockError }>;
    refreshSession: () => Promise<{ data: { session: null }; error: typeof mockError }>;
    setSession: (session: unknown) => Promise<{ data: { session: null }; error: typeof mockError }>;
  };
  from: (table: string) => {
    select: (columns?: string) => {
      data: null;
      error: typeof mockError;
      eq: (column: string, value: unknown) => {
        data: null;
        error: typeof mockError;
        single: () => Promise<{ data: null; error: typeof mockError }>;
        maybeSingle: () => Promise<{ data: null; error: typeof mockError }>;
        order: (column: string, options?: { ascending: boolean }) => {
          data: null;
          error: typeof mockError;
          range: (from: number, to: number) => Promise<{ data: null; error: typeof mockError }>;
        };
      };
      order: (column: string, options?: { ascending: boolean }) => {
        data: null;
        error: typeof mockError;
        range: (from: number, to: number) => Promise<{ data: null; error: typeof mockError }>;
      };
    };
    insert: (data: unknown) => {
      select: (columns?: string) => {
        single: () => Promise<{ data: null; error: typeof mockError }>;
      };
    };
    update: (data: unknown) => {
      eq: (column: string, value: unknown) => {
        select: (columns?: string) => {
          single: () => Promise<{ data: null; error: typeof mockError }>;
        };
      };
    };
    delete: () => {
      eq: (column: string, value: unknown) => Promise<{ error: typeof mockError }>;
      match: (criteria: Record<string, unknown>) => Promise<{ error: typeof mockError }>;
    };
    upsert: (data: unknown) => Promise<{ data: null; error: typeof mockError }>;
  };
  rpc: (fn: string, params?: unknown) => Promise<{ data: null; error: typeof mockError }>;
  functions: {
    invoke: (fn: string, options?: unknown) => Promise<{ data: null; error: typeof mockError }>;
  };
  storage: {
    from: (bucket: string) => {
      upload: (path: string, file: unknown) => Promise<{ data: null; error: typeof mockError }>;
      download: (path: string) => Promise<{ data: null; error: typeof mockError }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
      remove: (paths: string[]) => Promise<{ data: null; error: typeof mockError }>;
    };
  };
  channel: (name: string) => {
    on: (event: string, filter: unknown, callback: unknown) => MockSupabaseClient['channel'] extends (name: string) => infer R ? R : never;
    subscribe: () => typeof mockSubscription;
    unsubscribe: () => void;
  };
}

// Mock client for when Supabase is not configured
const mockSupabase: MockSupabaseClient = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: mockError }),
    getUser: () => Promise.resolve({ data: { user: null }, error: mockError }),
    onAuthStateChange: () => ({ data: { subscription: mockSubscription } }),
    signOut: () => Promise.resolve({ error: mockError }),
    signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: mockError }),
    signUp: () => Promise.resolve({ data: { user: null, session: null }, error: mockError }),
    resetPasswordForEmail: () => Promise.resolve({ error: mockError }),
    updateUser: () => Promise.resolve({ data: { user: null }, error: mockError }),
    verifyOtp: () => Promise.resolve({ data: { user: null, session: null }, error: mockError }),
    resend: () => Promise.resolve({ error: mockError }),
    refreshSession: () => Promise.resolve({ data: { session: null }, error: mockError }),
    setSession: () => Promise.resolve({ data: { session: null }, error: mockError }),
  },
  from: () => ({
    select: () => ({
      data: null,
      error: mockError,
      eq: () => ({
        data: null,
        error: mockError,
        single: () => Promise.resolve({ data: null, error: mockError }),
        maybeSingle: () => Promise.resolve({ data: null, error: mockError }),
        order: () => ({
          data: null,
          error: mockError,
          range: () => Promise.resolve({ data: null, error: mockError }),
        }),
      }),
      order: () => ({
        data: null,
        error: mockError,
        range: () => Promise.resolve({ data: null, error: mockError }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: null, error: mockError }),
      }),
    }),
    update: () => ({
      eq: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: null, error: mockError }),
        }),
      }),
    }),
    delete: () => ({
      eq: () => Promise.resolve({ error: mockError }),
      match: () => Promise.resolve({ error: mockError }),
    }),
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
  channel: () => {
    const channelObj = {
      on: function() { return channelObj; },
      subscribe: () => mockSubscription,
      unsubscribe: () => {},
    };
    return channelObj as ReturnType<MockSupabaseClient['channel']>;
  },
};

// Create real client only if configured, otherwise use mock
// Using 'any' to avoid "Type instantiation is excessively deep" error with union types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: any;

if (isConfigured) {
  supabase = createClient(ENV.SUPABASE_URL!, ENV.SUPABASE_ANON_KEY!, {
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

// Type helper for consumers - use this for typed access when needed
export type { SupabaseClient };
export type { MockSupabaseClient };
