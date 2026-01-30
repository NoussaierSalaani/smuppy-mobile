/**
 * AWS Cognito Authentication Service
 * Using @aws-sdk/client-cognito-identity-provider for better React Native compatibility
 *
 * SECURITY: Sensitive tokens (access, refresh, id) stored in SecureStore (encrypted keychain)
 * All auth data (tokens + user profile) stored in SecureStore (encrypted keychain)
 */

// IMPORTANT: crypto polyfill is loaded in index.js before this file
import * as SecureStore from 'expo-secure-store';
import { AWS_CONFIG } from '../config/aws-config';

// Lazy-loaded Cognito client to ensure crypto polyfill is ready
let cognitoClient: any = null;
let CognitoCommands: any = null;

const getCognitoClient = async () => {
  if (!cognitoClient) {
    const { CognitoIdentityProviderClient } = await import('@aws-sdk/client-cognito-identity-provider');
    cognitoClient = new CognitoIdentityProviderClient({
      region: AWS_CONFIG.region,
    });
  }
  return cognitoClient;
};

const getCognitoCommands = async () => {
  if (!CognitoCommands) {
    CognitoCommands = await import('@aws-sdk/client-cognito-identity-provider');
  }
  return CognitoCommands;
};

const CLIENT_ID = AWS_CONFIG.cognito.userPoolClientId;

// Token storage keys
// SECURITY: All auth data uses SecureStore (encrypted keychain)
const TOKEN_KEYS = {
  ACCESS_TOKEN: 'smuppy_access_token',
  REFRESH_TOKEN: 'smuppy_refresh_token',
  ID_TOKEN: 'smuppy_id_token',
  USER: 'smuppy_user',
};

// SecureStore helpers with error handling
const secureStore = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.warn(`[SecureStore] setItem failed for "${key}" (${value.length} chars):`, (error as Error).message);
    }
  },
  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.warn(`[SecureStore] getItem failed for "${key}":`, (error as Error).message);
      return null;
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.warn(`[SecureStore] removeItem failed for "${key}":`, (error as Error).message);
    }
  },
};

/**
 * Base64 URL decode that works on all JS engines (Hermes, JSC, V8)
 * without depending on global.atob polyfill availability.
 */
function base64UrlDecode(str: string): string {
  // Base64url → standard Base64
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Pad to multiple of 4
  while (b64.length % 4 !== 0) b64 += '=';

  // Pure-JS Base64 decode
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(128);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;

  const bytes: number[] = [];
  for (let i = 0; i < b64.length; i += 4) {
    const a = lookup[b64.charCodeAt(i)];
    const b = lookup[b64.charCodeAt(i + 1)];
    const c = lookup[b64.charCodeAt(i + 2)];
    const d = lookup[b64.charCodeAt(i + 3)];
    bytes.push((a << 2) | (b >> 4));
    if (b64[i + 2] !== '=') bytes.push(((b & 0xf) << 4) | (c >> 2));
    if (b64[i + 3] !== '=') bytes.push(((c & 0x3) << 6) | d);
  }
  return decodeURIComponent(
    bytes.map(b => '%' + ('00' + b.toString(16)).slice(-2)).join('')
  );
}

export interface AuthUser {
  id: string;
  email: string;
  username?: string;
  emailVerified: boolean;
  phoneNumber?: string;
  attributes: Record<string, string>;
}

export interface SignUpParams {
  email: string;
  password: string;
  username?: string;
  fullName?: string;
  phoneNumber?: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

class AWSAuthService {
  private user: AuthUser | null = null;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private idToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private authStateListeners: ((user: AuthUser | null) => void)[] = [];

  /**
   * Initialize auth service - check for existing session
   */
  async initialize(): Promise<AuthUser | null> {
    try {
      if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Initializing...');

      // Load tokens and user profile from secure storage
      const [accessToken, refreshToken, idToken, userJson] = await Promise.all([
        secureStore.getItem(TOKEN_KEYS.ACCESS_TOKEN),
        secureStore.getItem(TOKEN_KEYS.REFRESH_TOKEN),
        secureStore.getItem(TOKEN_KEYS.ID_TOKEN),
        secureStore.getItem(TOKEN_KEYS.USER),
      ]);

      if (!accessToken || !userJson) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[AWS Auth] No stored session found', {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            hasIdToken: !!idToken,
            hasUser: !!userJson,
          });
        }
        return null;
      }

      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.idToken = idToken;

      try {
        this.user = JSON.parse(userJson);
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Restored session');

        // Check token expiry locally (no network call) to avoid failing on cold start
        if (!this.isTokenExpired(accessToken)) {
          if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Token still valid (local check)');
          return this.user;
        }

        // Token expired locally — try refresh
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Token expired, trying refresh...');
        const refreshed = await this.refreshSession();
        if (!refreshed && !this.user) {
          // refreshSession only clears session on auth errors, not network errors.
          // If user is still set, it was a network error — keep session alive.
          return null;
        }

        return this.user;
      } catch {
        console.error('[AWS Auth] Failed to parse stored user');
        await this.clearSession();
        return null;
      }
    } catch (error) {
      console.error('[AWS Auth] Initialize error:', error);
      return null;
    }
  }

  /**
   * Sign up new user
   * Uses server-side API to handle unconfirmed users properly
   * (deletes unconfirmed users and creates new ones with the new password)
   */
  async signUp(params: SignUpParams): Promise<{ user: AuthUser | null; confirmationRequired: boolean }> {
    const { email, password, username, fullName } = params;

    if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] SignUp attempt');

    try {
      // Try server-side smart signup first (handles unconfirmed users)
      const { awsAPI } = await import('./aws-api');

      const result = await awsAPI.smartSignup({
        email,
        password,
        username,
        fullName,
      });

      if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Smart SignUp result:', result);

      if (!result.success) {
        throw new Error(result.message || 'Signup failed');
      }

      return {
        user: result.userSub ? {
          id: result.userSub,
          email,
          username,
          emailVerified: false,
          attributes: {},
        } : null,
        confirmationRequired: result.confirmationRequired,
      };
    } catch (apiError: any) {
      // If API endpoint doesn't exist yet, fall back to direct Cognito signup
      if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Smart signup failed, falling back to direct Cognito:', apiError.message);

      if (apiError.statusCode === 404 || apiError.message?.includes('Not Found')) {
        return this.signUpDirect(params);
      }

      // Re-throw other errors
      throw apiError;
    }
  }

  /**
   * Direct Cognito signup (fallback if API not available)
   */
  private async signUpDirect(params: SignUpParams): Promise<{ user: AuthUser | null; confirmationRequired: boolean }> {
    const { email, password, username, fullName } = params;

    try {
      const client = await getCognitoClient();
      const { SignUpCommand } = await getCognitoCommands();

      // Generate a deterministic username from email (Cognito requires non-email username when email alias is enabled)
      // Example: john@gmail.com -> johngmailcom (no special chars, no prefix)
      const emailHash = email.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cognitoUsername = username || emailHash;

      const userAttributes = [
        { Name: 'email', Value: email },
      ];

      if (fullName) {
        userAttributes.push({ Name: 'name', Value: fullName });
      }

      if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Direct SignUp username:', cognitoUsername);

      const command = new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: cognitoUsername,
        Password: password,
        UserAttributes: userAttributes,
      });

      const response = await client.send(command);

      if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Direct SignUp success:', response.UserSub);

      return {
        user: response.UserSub ? {
          id: response.UserSub,
          email,
          username,
          emailVerified: false,
          attributes: {},
        } : null,
        confirmationRequired: !response.UserConfirmed,
      };
    } catch (error: any) {
      console.error('[AWS Auth] Direct SignUp error:', error.name, error.message);
      throw error;
    }
  }

  /**
   * Confirm sign up with verification code
   * Uses server-side API for better error handling and consistency
   * NOTE: Uses email directly as username (Cognito supports email alias)
   */
  async confirmSignUp(email: string, code: string): Promise<boolean> {
    if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Confirming signup');

    // Use email directly - Cognito supports email as username with alias
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Try server-side API first
      const { awsAPI } = await import('./aws-api');
      const result = await awsAPI.confirmSignup({ email, code });

      if (result.success) {
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Confirm signup success via API');
        return true;
      }

      throw new Error(result.message || 'Confirmation failed');
    } catch (apiError: any) {
      // If API endpoint doesn't exist, fall back to direct Cognito
      if (apiError.statusCode === 404 || apiError.message?.includes('Not Found')) {
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] API not available, using direct Cognito');

        const client = await getCognitoClient();
        const { ConfirmSignUpCommand } = await getCognitoCommands();

        // Use email directly - Cognito will find user by email alias
        const command = new ConfirmSignUpCommand({
          ClientId: CLIENT_ID,
          Username: normalizedEmail,
          ConfirmationCode: code,
        });

        await client.send(command);
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Confirm signup success via Cognito');
        return true;
      }

      console.error('[AWS Auth] Confirm signup error:', apiError.message);
      throw apiError;
    }
  }

  /**
   * Resend confirmation code
   * Uses server-side API for rate limiting and better error handling
   * NOTE: Uses email directly as username (Cognito supports email alias)
   */
  async resendConfirmationCode(email: string): Promise<boolean> {
    if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Resending confirmation code');

    // Use email directly - Cognito supports email as username with alias
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Try server-side API first (has rate limiting)
      const { awsAPI } = await import('./aws-api');
      const result = await awsAPI.resendConfirmationCode(email);

      if (result.success) {
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Resend confirmation code success via API');
        return true;
      }

      throw new Error(result.message || 'Resend failed');
    } catch (apiError: any) {
      // Handle rate limiting
      if (apiError.statusCode === 429) {
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Rate limited');
        throw apiError;
      }

      // If API endpoint doesn't exist, fall back to direct Cognito
      if (apiError.statusCode === 404 || apiError.message?.includes('Not Found')) {
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] API not available, using direct Cognito');

        const client = await getCognitoClient();
        const { ResendConfirmationCodeCommand } = await getCognitoCommands();

        // Use email directly - Cognito will find user by email alias
        const command = new ResendConfirmationCodeCommand({
          ClientId: CLIENT_ID,
          Username: normalizedEmail,
        });

        await client.send(command);
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Resend confirmation code success via Cognito');
        return true;
      }

      console.error('[AWS Auth] Resend confirmation code error:', apiError.message);
      throw apiError;
    }
  }

  /**
   * Sign in user
   */
  async signIn(params: SignInParams): Promise<AuthUser> {
    const { email, password } = params;

    const client = await getCognitoClient();
    const { InitiateAuthCommand } = await getCognitoCommands();

    const command = new InitiateAuthCommand({
      ClientId: CLIENT_ID,
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    });

    const response = await client.send(command);

    if (!response.AuthenticationResult) {
      throw new Error('Authentication failed - no result');
    }

    const { AccessToken, RefreshToken, IdToken } = response.AuthenticationResult;

    if (!AccessToken || !IdToken) {
      throw new Error('No tokens received');
    }

    // Store tokens
    this.accessToken = AccessToken;
    this.refreshToken = RefreshToken || null;
    this.idToken = IdToken;

    // Decode ID token to get user info (faster than API call)
    const user = this.decodeIdToken(IdToken);
    this.user = user;

    // Store tokens and user profile in SecureStore (encrypted)
    await Promise.all([
      secureStore.setItem(TOKEN_KEYS.ACCESS_TOKEN, AccessToken),
      RefreshToken && secureStore.setItem(TOKEN_KEYS.REFRESH_TOKEN, RefreshToken),
      secureStore.setItem(TOKEN_KEYS.ID_TOKEN, IdToken),
      secureStore.setItem(TOKEN_KEYS.USER, JSON.stringify(user)),
    ]);

    // Verify tokens were persisted (catches silent SecureStore failures)
    if (process.env.NODE_ENV === 'development') {
      const check = await secureStore.getItem(TOKEN_KEYS.ACCESS_TOKEN);
      console.log('[AWS Auth] Tokens persisted:', check ? 'YES' : 'NO (SecureStore write failed)');
    }

    this.notifyAuthStateChange(user);
    return user;
  }

  /**
   * Decode ID token to extract user info (no API call needed)
   */
  private decodeIdToken(idToken: string): AuthUser {
    try {
      const parts = idToken.split('.');
      if (parts.length !== 3) throw new Error('Invalid token');

      const payload = JSON.parse(base64UrlDecode(parts[1]));

      return {
        id: payload.sub || '',
        email: payload.email || '',
        username: payload['cognito:username'] || payload.email?.split('@')[0] || '',
        emailVerified: payload.email_verified === true,
        phoneNumber: payload.phone_number,
        attributes: payload,
      };
    } catch {
      throw new Error('Failed to decode token');
    }
  }

  /**
   * Sign out user
   */
  async signOut(): Promise<void> {
    if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] SignOut');

    try {
      if (this.accessToken) {
        const client = await getCognitoClient();
        const { GlobalSignOutCommand } = await getCognitoCommands();
        const command = new GlobalSignOutCommand({
          AccessToken: this.accessToken,
        });
        await client.send(command).catch(() => {});
      }
    } catch {
      // Ignore signout errors
    }

    await this.clearSession();
    this.notifyAuthStateChange(null);
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    if (this.user) {
      return this.user;
    }

    // Try to restore from storage
    await this.initialize();
    return this.user;
  }

  /**
   * Request password reset
   * Uses server-side API for rate limiting and consistent error handling
   * NOTE: Uses email directly as username (Cognito supports email alias)
   */
  async forgotPassword(email: string): Promise<boolean> {
    if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Forgot password');

    // Use email directly - Cognito supports email as username with alias
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Try server-side API first (has rate limiting)
      const { awsAPI } = await import('./aws-api');
      const result = await awsAPI.forgotPassword(email);

      if (result.success) {
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Forgot password code sent via API');
        return true;
      }

      // API returns success even for non-existent users (anti-enumeration)
      return true;
    } catch (apiError: any) {
      // Handle rate limiting
      if (apiError.statusCode === 429) {
        throw apiError;
      }

      // If API endpoint doesn't exist, fall back to direct Cognito
      if (apiError.statusCode === 404 || apiError.message?.includes('Not Found')) {
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] API not available, using direct Cognito');

        const client = await getCognitoClient();
        const { ForgotPasswordCommand } = await getCognitoCommands();

        // Use email directly - Cognito will find user by email alias
        const command = new ForgotPasswordCommand({
          ClientId: CLIENT_ID,
          Username: normalizedEmail,
        });

        await client.send(command);
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Forgot password code sent via Cognito');
        return true;
      }

      console.error('[AWS Auth] Forgot password error:', apiError.message);
      throw apiError;
    }
  }

  /**
   * Confirm password reset with code
   * NOTE: Uses email directly as username (Cognito supports email alias)
   */
  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<boolean> {
    if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Confirm forgot password');

    // Use email directly - Cognito supports email as username with alias
    const normalizedEmail = email.toLowerCase().trim();

    try {
      // Try server-side API first
      const { awsAPI } = await import('./aws-api');
      const result = await awsAPI.confirmForgotPassword({ email, code, newPassword });

      if (result.success) {
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Password reset success via API');
        return true;
      }

      throw new Error(result.message || 'Password reset failed');
    } catch (apiError: any) {
      // If API endpoint doesn't exist, fall back to direct Cognito
      if (apiError.statusCode === 404 || apiError.message?.includes('Not Found')) {
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] API not available, using direct Cognito');

        const client = await getCognitoClient();
        const { ConfirmForgotPasswordCommand } = await getCognitoCommands();

        // Use email directly - Cognito will find user by email alias
        const command = new ConfirmForgotPasswordCommand({
          ClientId: CLIENT_ID,
          Username: normalizedEmail,
          ConfirmationCode: code,
          Password: newPassword,
        });

        await client.send(command);
        if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Password reset success via Cognito');
        return true;
      }

      console.error('[AWS Auth] Confirm forgot password error:', apiError.message);
      throw apiError;
    }
  }

  /**
   * Check if a JWT token is expired (with 60s buffer)
   */
  private isTokenExpired(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return true;
      const payload = JSON.parse(base64UrlDecode(parts[1]));
      // Expired if less than 60 seconds remaining
      return !payload.exp || payload.exp * 1000 < Date.now() + 60_000;
    } catch {
      return true;
    }
  }

  /**
   * Get access token for API calls
   * Automatically refreshes if expired
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.accessToken) {
      await this.initialize();
    }
    if (this.accessToken && this.isTokenExpired(this.accessToken)) {
      if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Access token expired, refreshing...');
      await this.refreshSessionOnce();
    }
    return this.accessToken;
  }

  /**
   * Get ID token for API calls
   * Automatically refreshes if expired
   */
  async getIdToken(): Promise<string | null> {
    if (!this.idToken) {
      await this.initialize();
    }
    if (this.idToken && this.isTokenExpired(this.idToken)) {
      if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] ID token expired, refreshing...');
      await this.refreshSessionOnce();
    }
    return this.idToken;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  /**
   * Check if email is verified
   */
  async isEmailVerified(): Promise<boolean> {
    const user = await this.getCurrentUser();
    return user?.emailVerified ?? false;
  }

  /**
   * Verify current password
   */
  async verifyPassword(password: string): Promise<boolean> {
    const user = await this.getCurrentUser();
    if (!user?.email) {
      return false;
    }

    try {
      await this.signIn({ email: user.email, password });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    if (!this.accessToken) {
      throw new Error('No authenticated user');
    }

    try {
      const client = await getCognitoClient();
      const { ChangePasswordCommand } = await getCognitoCommands();

      const command = new ChangePasswordCommand({
        AccessToken: this.accessToken,
        PreviousPassword: oldPassword,
        ProposedPassword: newPassword,
      });

      await client.send(command);
      if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Password changed successfully');
    } catch (error: any) {
      console.error('[AWS Auth] Change password error:', error.name, error.message);
      throw error;
    }
  }

  /**
   * Request password reset email
   */
  async requestPasswordReset(email: string): Promise<void> {
    await this.forgotPassword(email);
  }

  /**
   * Sign in with Apple ID token
   */
  async signInWithApple(identityToken: string, nonce: string): Promise<AuthUser> {
    if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Apple Sign-In');

    try {
      const { awsAPI } = await import('./aws-api');
      const result = await awsAPI.request<{
        user: AuthUser;
        tokens: { accessToken: string; idToken: string; refreshToken: string };
      }>('/auth/apple', {
        method: 'POST',
        body: { identityToken, nonce },
        authenticated: false,
      });

      // Store tokens
      this.accessToken = result.tokens.accessToken;
      this.idToken = result.tokens.idToken;
      this.refreshToken = result.tokens.refreshToken;
      this.user = result.user;

      await Promise.all([
        secureStore.setItem(TOKEN_KEYS.ACCESS_TOKEN, result.tokens.accessToken),
        secureStore.setItem(TOKEN_KEYS.ID_TOKEN, result.tokens.idToken),
        secureStore.setItem(TOKEN_KEYS.REFRESH_TOKEN, result.tokens.refreshToken),
        secureStore.setItem(TOKEN_KEYS.USER, JSON.stringify(result.user)),
      ]);

      this.notifyAuthStateChange(result.user);
      return result.user;
    } catch (error: any) {
      console.error('[AWS Auth] Apple Sign-In error:', error);
      throw error;
    }
  }

  /**
   * Sign in with Google ID token
   */
  async signInWithGoogle(idToken: string, accessToken?: string): Promise<AuthUser> {
    if (process.env.NODE_ENV === 'development') console.log('[AWS Auth] Google Sign-In');

    try {
      const { awsAPI } = await import('./aws-api');
      const result = await awsAPI.request<{
        user: AuthUser;
        tokens: { accessToken: string; idToken: string; refreshToken: string };
      }>('/auth/google', {
        method: 'POST',
        body: { idToken, accessToken },
        authenticated: false,
      });

      // Store tokens
      this.accessToken = result.tokens.accessToken;
      this.idToken = result.tokens.idToken;
      this.refreshToken = result.tokens.refreshToken;
      this.user = result.user;

      await Promise.all([
        secureStore.setItem(TOKEN_KEYS.ACCESS_TOKEN, result.tokens.accessToken),
        secureStore.setItem(TOKEN_KEYS.ID_TOKEN, result.tokens.idToken),
        secureStore.setItem(TOKEN_KEYS.REFRESH_TOKEN, result.tokens.refreshToken),
        secureStore.setItem(TOKEN_KEYS.USER, JSON.stringify(result.user)),
      ]);

      this.notifyAuthStateChange(result.user);
      return result.user;
    } catch (error: any) {
      console.error('[AWS Auth] Google Sign-In error:', error);
      throw error;
    }
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (user: AuthUser | null) => void): () => void {
    this.authStateListeners.push(callback);
    return () => {
      this.authStateListeners = this.authStateListeners.filter(cb => cb !== callback);
    };
  }

  // Private methods

  private async refreshSessionOnce(): Promise<boolean> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.refreshSession().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refreshSession(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const client = await getCognitoClient();
      const { InitiateAuthCommand } = await getCognitoCommands();

      const command = new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: {
          REFRESH_TOKEN: this.refreshToken,
        },
      });

      const response = await client.send(command);

      if (response.AuthenticationResult?.AccessToken) {
        this.accessToken = response.AuthenticationResult.AccessToken;
        this.idToken = response.AuthenticationResult.IdToken || this.idToken;

        await Promise.all([
          this.accessToken && secureStore.setItem(TOKEN_KEYS.ACCESS_TOKEN, this.accessToken),
          this.idToken && secureStore.setItem(TOKEN_KEYS.ID_TOKEN, this.idToken),
        ]);

        return true;
      }
      return false;
    } catch (error: unknown) {
      // Distinguish network errors from auth errors
      const isNetworkError = error instanceof Error && (
        error.message.includes('Network') ||
        error.message.includes('network') ||
        error.message.includes('fetch') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('timeout') ||
        error.name === 'TypeError' // fetch failures in RN
      );

      if (isNetworkError) {
        // Network error — keep session alive so Remember Me works on cold start
        console.warn('[AWS Auth] Token refresh failed due to network, keeping session');
        return false;
      }

      // Auth error (token revoked, invalid, etc.) — clear session
      console.warn('[AWS Auth] Token refresh failed (auth error), clearing session');
      await this.clearSession();
      return false;
    }
  }

  private async clearSession(): Promise<void> {
    this.user = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.idToken = null;

    await Promise.all([
      secureStore.removeItem(TOKEN_KEYS.ACCESS_TOKEN),
      secureStore.removeItem(TOKEN_KEYS.REFRESH_TOKEN),
      secureStore.removeItem(TOKEN_KEYS.ID_TOKEN),
      secureStore.removeItem(TOKEN_KEYS.USER),
    ]);
  }

  private notifyAuthStateChange(user: AuthUser | null): void {
    this.authStateListeners.forEach(callback => {
      try {
        callback(user);
      } catch (error) {
        console.error('[AWS Auth] Error in auth state listener:', error);
      }
    });
  }
}

// Export singleton instance
export const awsAuth = new AWSAuthService();
export default awsAuth;
