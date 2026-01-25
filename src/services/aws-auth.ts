/**
 * AWS Cognito Authentication Service
 * Using amazon-cognito-identity-js for React Native compatibility
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  ISignUpResult,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AWS_CONFIG } from '../config/aws-config';

// Initialize User Pool
const poolData = {
  UserPoolId: AWS_CONFIG.cognito.userPoolId,
  ClientId: AWS_CONFIG.cognito.userPoolClientId,
};

console.log('[AWS Auth] Initializing Cognito with:', {
  userPoolId: poolData.UserPoolId,
  clientId: poolData.ClientId,
});

const userPool = new CognitoUserPool(poolData);

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

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresAt: number;
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
  private currentUser: CognitoUser | null = null;
  private user: AuthUser | null = null;
  private authStateListeners: ((user: AuthUser | null) => void)[] = [];

  /**
   * Initialize auth service - check for existing session
   */
  async initialize(): Promise<AuthUser | null> {
    try {
      console.log('[AWS Auth] Initializing...');
      const cognitoUser = userPool.getCurrentUser();

      if (!cognitoUser) {
        console.log('[AWS Auth] No current user found');
        return null;
      }

      this.currentUser = cognitoUser;

      return new Promise((resolve) => {
        cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
          if (err || !session || !session.isValid()) {
            console.log('[AWS Auth] Session invalid or error:', err?.message);
            resolve(null);
            return;
          }

          console.log('[AWS Auth] Valid session found');
          this.getUserAttributes(cognitoUser).then((user) => {
            this.user = user;
            resolve(user);
          }).catch(() => resolve(null));
        });
      });
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

    const attributeList: CognitoUserAttribute[] = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
    ];

    if (fullName) {
      attributeList.push(new CognitoUserAttribute({ Name: 'name', Value: fullName }));
    }

    if (username) {
      attributeList.push(new CognitoUserAttribute({ Name: 'preferred_username', Value: username }));
    }

    return new Promise((resolve, reject) => {
      userPool.signUp(
        email,
        password,
        attributeList,
        [],
        (err: Error | undefined, result: ISignUpResult | undefined) => {
          if (err) {
            console.error('[AWS Auth] SignUp error:', err.name, err.message);
            reject(err);
            return;
          }

          console.log('[AWS Auth] SignUp success:', result?.userSub);

          resolve({
            user: result?.userSub ? {
              id: result.userSub,
              email,
              username,
              emailVerified: false,
              attributes: {},
            } : null,
            confirmationRequired: !result?.userConfirmed,
          });
        }
      );
    });
  }

  /**
   * Confirm sign up with verification code
   */
  async confirmSignUp(email: string, code: string): Promise<boolean> {
    console.log('[AWS Auth] Confirming signup for:', email);

    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    return new Promise((resolve, reject) => {
      cognitoUser.confirmRegistration(code, true, (err: Error | undefined, result: string) => {
        if (err) {
          console.error('[AWS Auth] Confirm signup error:', err.message);
          reject(err);
          return;
        }
        console.log('[AWS Auth] Confirm signup success:', result);
        resolve(true);
      });
    });
  }

  /**
   * Resend confirmation code
   */
  async resendConfirmationCode(email: string): Promise<boolean> {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    return new Promise((resolve, reject) => {
      cognitoUser.resendConfirmationCode((err: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(true);
      });
    });
  }

  /**
   * Sign in user
   */
  async signIn(params: SignInParams): Promise<AuthUser> {
    const { email, password } = params;

    console.log('[AWS Auth] SignIn attempt:', { email });

    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    return new Promise((resolve, reject) => {
      cognitoUser.authenticateUser(authDetails, {
        onSuccess: async (session: CognitoUserSession) => {
          console.log('[AWS Auth] SignIn success');
          this.currentUser = cognitoUser;

          try {
            const user = await this.getUserAttributes(cognitoUser);
            this.user = user;
            this.notifyAuthStateChange(user);
            resolve(user);
          } catch (error) {
            reject(error);
          }
        },
        onFailure: (err: Error) => {
          console.error('[AWS Auth] SignIn error:', err.name, err.message);
          reject(err);
        },
        newPasswordRequired: (userAttributes: any) => {
          console.log('[AWS Auth] New password required');
          reject(new Error('New password required'));
        },
      });
    });
  }

  /**
   * Sign out user
   */
  async signOut(): Promise<void> {
    console.log('[AWS Auth] SignOut');

    if (this.currentUser) {
      this.currentUser.signOut();
    }

    this.currentUser = null;
    this.user = null;

    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEYS.ACCESS_TOKEN),
      AsyncStorage.removeItem(TOKEN_KEYS.REFRESH_TOKEN),
      AsyncStorage.removeItem(TOKEN_KEYS.ID_TOKEN),
      AsyncStorage.removeItem(TOKEN_KEYS.USER),
    ]);

    this.notifyAuthStateChange(null);
  }

  /**
   * Get current authenticated user
   */
  async getCurrentUser(): Promise<AuthUser | null> {
    if (this.user) {
      return this.user;
    }

    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      return null;
    }

    return new Promise((resolve) => {
      cognitoUser.getSession(async (err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session || !session.isValid()) {
          resolve(null);
          return;
        }

        try {
          const user = await this.getUserAttributes(cognitoUser);
          this.user = user;
          resolve(user);
        } catch {
          resolve(null);
        }
      });
    });
  }

  /**
   * Request password reset
   */
  async forgotPassword(email: string): Promise<boolean> {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    return new Promise((resolve, reject) => {
      cognitoUser.forgotPassword({
        onSuccess: () => resolve(true),
        onFailure: (err: Error) => reject(err),
      });
    });
  }

  /**
   * Confirm password reset with code
   */
  async confirmForgotPassword(email: string, code: string, newPassword: string): Promise<boolean> {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    return new Promise((resolve, reject) => {
      cognitoUser.confirmPassword(code, newPassword, {
        onSuccess: () => resolve(true),
        onFailure: (err: Error) => reject(err),
      });
    });
  }

  /**
   * Get access token for API calls
   */
  async getAccessToken(): Promise<string | null> {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      return null;
    }

    return new Promise((resolve) => {
      cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          resolve(null);
          return;
        }
        resolve(session.getAccessToken().getJwtToken());
      });
    });
  }

  /**
   * Get ID token for API calls
   */
  async getIdToken(): Promise<string | null> {
    const cognitoUser = userPool.getCurrentUser();
    if (!cognitoUser) {
      return null;
    }

    return new Promise((resolve) => {
      cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
        if (err || !session) {
          resolve(null);
          return;
        }
        resolve(session.getIdToken().getJwtToken());
      });
    });
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.currentUser;
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

  private async getUserAttributes(cognitoUser: CognitoUser): Promise<AuthUser> {
    return new Promise((resolve, reject) => {
      cognitoUser.getUserAttributes((err: Error | undefined, attributes: CognitoUserAttribute[] | undefined) => {
        if (err) {
          reject(err);
          return;
        }

        const attrs: Record<string, string> = {};
        attributes?.forEach(attr => {
          attrs[attr.getName()] = attr.getValue();
        });

        resolve({
          id: attrs['sub'] || '',
          email: attrs['email'] || '',
          username: attrs['preferred_username'] || attrs['email'],
          emailVerified: attrs['email_verified'] === 'true',
          phoneNumber: attrs['phone_number'],
          attributes: attrs,
        });
      });
    });
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
