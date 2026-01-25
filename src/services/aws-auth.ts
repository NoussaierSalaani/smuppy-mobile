/**
 * AWS Cognito Authentication Service
 * Using @aws-sdk/client-cognito-identity-provider for better React Native compatibility
 */

import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  GetUserCommand,
  ChangePasswordCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AWS_CONFIG } from '../config/aws-config';

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: AWS_CONFIG.region,
});

const CLIENT_ID = AWS_CONFIG.cognito.userPoolClientId;

// Token storage keys
const TOKEN_KEYS = {
  ACCESS_TOKEN: '@smuppy/access_token',
  REFRESH_TOKEN: '@smuppy/refresh_token',
  ID_TOKEN: '@smuppy/id_token',
  USER: '@smuppy/user',
};

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
  private authStateListeners: ((user: AuthUser | null) => void)[] = [];

  /**
   * Initialize auth service - check for existing session
   */
  async initialize(): Promise<AuthUser | null> {
    try {
      console.log('[AWS Auth] Initializing...');

      // Load tokens from storage
      const [accessToken, refreshToken, idToken, userJson] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEYS.ACCESS_TOKEN),
        AsyncStorage.getItem(TOKEN_KEYS.REFRESH_TOKEN),
        AsyncStorage.getItem(TOKEN_KEYS.ID_TOKEN),
        AsyncStorage.getItem(TOKEN_KEYS.USER),
      ]);

      if (!accessToken || !userJson) {
        console.log('[AWS Auth] No stored session found');
        return null;
      }

      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.idToken = idToken;

      try {
        this.user = JSON.parse(userJson);
        console.log('[AWS Auth] Restored session for:', this.user?.email);

        // Verify token is still valid
        const isValid = await this.verifyToken();
        if (!isValid) {
          console.log('[AWS Auth] Token expired, trying refresh...');
          const refreshed = await this.refreshSession();
          if (!refreshed) {
            await this.clearSession();
            return null;
          }
        }

        return this.user;
      } catch (e) {
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
   */
  async signUp(params: SignUpParams): Promise<{ user: AuthUser | null; confirmationRequired: boolean }> {
    const { email, password, username, fullName } = params;

    console.log('[AWS Auth] SignUp attempt:', { email, username });

    try {
      const userAttributes = [
        { Name: 'email', Value: email },
      ];

      if (fullName) {
        userAttributes.push({ Name: 'name', Value: fullName });
      }

      if (username) {
        userAttributes.push({ Name: 'preferred_username', Value: username });
      }

      const command = new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: userAttributes,
      });

      const response = await cognitoClient.send(command);

      console.log('[AWS Auth] SignUp success:', response.UserSub);

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
      console.error('[AWS Auth] SignUp error:', error.name, error.message);
      throw error;
    }
  }

  /**
   * Confirm sign up with verification code
   */
  async confirmSignUp(email: string, code: string): Promise<boolean> {
    console.log('[AWS Auth] Confirming signup for:', email);

    try {
      const command = new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      });

      await cognitoClient.send(command);
      console.log('[AWS Auth] Confirm signup success');
      return true;
    } catch (error: any) {
      console.error('[AWS Auth] Confirm signup error:', error.name, error.message);
      throw error;
    }
  }

  /**
   * Resend confirmation code
   */
  async resendConfirmationCode(email: string): Promise<boolean> {
    console.log('[AWS Auth] Resending confirmation code for:', email);

    try {
      const command = new ResendConfirmationCodeCommand({
        ClientId: CLIENT_ID,
        Username: email,
      });

      await cognitoClient.send(command);
      console.log('[AWS Auth] Resend confirmation code success');
      return true;
    } catch (error: any) {
      console.error('[AWS Auth] Resend confirmation code error:', error.name, error.message);
      throw error;
    }
  }

  /**
   * Sign in user
   */
  async signIn(params: SignInParams): Promise<AuthUser> {
    const { email, password } = params;

    console.log('[AWS Auth] SignIn attempt:', { email });

    try {
      const command = new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
        },
      });

      const response = await cognitoClient.send(command);

      if (!response.AuthenticationResult) {
        throw new Error('Authentication failed - no result');
      }

      const { AccessToken, RefreshToken, IdToken } = response.AuthenticationResult;

      if (!AccessToken) {
        throw new Error('No access token received');
      }

      // Store tokens
      this.accessToken = AccessToken;
      this.refreshToken = RefreshToken || null;
      this.idToken = IdToken || null;

      await Promise.all([
        AsyncStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, AccessToken),
        RefreshToken && AsyncStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, RefreshToken),
        IdToken && AsyncStorage.setItem(TOKEN_KEYS.ID_TOKEN, IdToken),
      ]);

      // Get user attributes
      const user = await this.fetchUserAttributes();
      this.user = user;

      await AsyncStorage.setItem(TOKEN_KEYS.USER, JSON.stringify(user));

      console.log('[AWS Auth] SignIn success:', user.email);
      this.notifyAuthStateChange(user);

      return user;
    } catch (error: any) {
      console.error('[AWS Auth] SignIn error:', error.name, error.message);
      throw error;
    }
  }

  /**
   * Sign out user
   */
  async signOut(): Promise<void> {
    console.log('[AWS Auth] SignOut');

    try {
      if (this.accessToken) {
        const command = new GlobalSignOutCommand({
          AccessToken: this.accessToken,
        });
        await cognitoClient.send(command).catch(() => {});
      }
    } catch (e) {
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
   */
  async forgotPassword(email: string): Promise<boolean> {
    console.log('[AWS Auth] Forgot password for:', email);

    try {
      const command = new ForgotPasswordCommand({
        ClientId: CLIENT_ID,
        Username: email,
      });

      await cognitoClient.send(command);
      console.log('[AWS Auth] Forgot password code sent');
      return true;
    } catch (error: any) {
      console.error('[AWS Auth] Forgot password error:', error.name, error.message);
      throw error;
    }
  }

  /**
   * Confirm password reset with code
   */
  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<boolean> {
    console.log('[AWS Auth] Confirm forgot password for:', email);

    try {
      const command = new ConfirmForgotPasswordCommand({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
      });

      await cognitoClient.send(command);
      console.log('[AWS Auth] Password reset success');
      return true;
    } catch (error: any) {
      console.error('[AWS Auth] Confirm forgot password error:', error.name, error.message);
      throw error;
    }
  }

  /**
   * Get access token for API calls
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.accessToken) {
      await this.initialize();
    }
    return this.accessToken;
  }

  /**
   * Get ID token for API calls
   */
  async getIdToken(): Promise<string | null> {
    if (!this.idToken) {
      await this.initialize();
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
      const command = new ChangePasswordCommand({
        AccessToken: this.accessToken,
        PreviousPassword: oldPassword,
        ProposedPassword: newPassword,
      });

      await cognitoClient.send(command);
      console.log('[AWS Auth] Password changed successfully');
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
    console.log('[AWS Auth] Apple Sign-In');

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
        AsyncStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, result.tokens.accessToken),
        AsyncStorage.setItem(TOKEN_KEYS.ID_TOKEN, result.tokens.idToken),
        AsyncStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, result.tokens.refreshToken),
        AsyncStorage.setItem(TOKEN_KEYS.USER, JSON.stringify(result.user)),
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
    console.log('[AWS Auth] Google Sign-In');

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
        AsyncStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, result.tokens.accessToken),
        AsyncStorage.setItem(TOKEN_KEYS.ID_TOKEN, result.tokens.idToken),
        AsyncStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, result.tokens.refreshToken),
        AsyncStorage.setItem(TOKEN_KEYS.USER, JSON.stringify(result.user)),
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

  private async fetchUserAttributes(): Promise<AuthUser> {
    if (!this.accessToken) {
      throw new Error('No access token');
    }

    const command = new GetUserCommand({
      AccessToken: this.accessToken,
    });

    const response = await cognitoClient.send(command);

    const attrs: Record<string, string> = {};
    response.UserAttributes?.forEach(attr => {
      if (attr.Name && attr.Value) {
        attrs[attr.Name] = attr.Value;
      }
    });

    return {
      id: attrs['sub'] || '',
      email: attrs['email'] || '',
      username: attrs['preferred_username'] || attrs['email'],
      emailVerified: attrs['email_verified'] === 'true',
      phoneNumber: attrs['phone_number'],
      attributes: attrs,
    };
  }

  private async verifyToken(): Promise<boolean> {
    if (!this.accessToken) return false;

    try {
      const command = new GetUserCommand({
        AccessToken: this.accessToken,
      });
      await cognitoClient.send(command);
      return true;
    } catch {
      return false;
    }
  }

  private async refreshSession(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const command = new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: {
          REFRESH_TOKEN: this.refreshToken,
        },
      });

      const response = await cognitoClient.send(command);

      if (response.AuthenticationResult?.AccessToken) {
        this.accessToken = response.AuthenticationResult.AccessToken;
        this.idToken = response.AuthenticationResult.IdToken || this.idToken;

        await Promise.all([
          AsyncStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, this.accessToken),
          this.idToken && AsyncStorage.setItem(TOKEN_KEYS.ID_TOKEN, this.idToken),
        ]);

        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async clearSession(): Promise<void> {
    this.user = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.idToken = null;

    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEYS.ACCESS_TOKEN),
      AsyncStorage.removeItem(TOKEN_KEYS.REFRESH_TOKEN),
      AsyncStorage.removeItem(TOKEN_KEYS.ID_TOKEN),
      AsyncStorage.removeItem(TOKEN_KEYS.USER),
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
