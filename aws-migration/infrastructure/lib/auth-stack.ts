import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export interface AuthStackProps extends cdk.NestedStackProps {
  environment: string;
  isProduction: boolean;
}

/**
 * Auth Nested Stack
 * Contains Cognito User Pool and Identity Pool
 */
export class AuthStack extends cdk.NestedStack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { environment, isProduction } = props;

    // Cognito User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `smuppy-users-${environment}`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: true,
      },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        'account_type': new cognito.StringAttribute({ mutable: true }),
        'profile_id': new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      advancedSecurityMode: isProduction
        ? cognito.AdvancedSecurityMode.ENFORCED
        : cognito.AdvancedSecurityMode.AUDIT,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: true,
      },
      removalPolicy: isProduction ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // User Pool Client
    this.userPoolClient = this.userPool.addClient('AppClient', {
      userPoolClientName: `smuppy-app-${environment}`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: ['smuppy://auth/callback'],
        logoutUrls: ['smuppy://auth/logout'],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: cdk.Duration.minutes(15),
      idTokenValidity: cdk.Duration.minutes(15),
      refreshTokenValidity: cdk.Duration.days(7),
    });

    // Identity Pool
    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `smuppy_identity_${environment}`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [{
        clientId: this.userPoolClient.userPoolClientId,
        providerName: this.userPool.userPoolProviderName,
      }],
    });
  }
}
