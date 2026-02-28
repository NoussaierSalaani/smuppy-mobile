import type { AWSAPIService } from '../aws-api';

export async function smartSignup(
  api: AWSAPIService,
  data: {
    email: string;
    password: string;
    username?: string;
    fullName?: string;
  }
): Promise<{
  success: boolean;
  userSub?: string;
  confirmationRequired: boolean;
  message?: string;
}> {
  return api.request('/auth/signup', {
    method: 'POST',
    body: data,
    authenticated: false,
  });
}

export async function confirmSignup(
  api: AWSAPIService,
  data: {
    email: string;
    code: string;
  }
): Promise<{
  success: boolean;
  message?: string;
}> {
  return api.request('/auth/confirm-signup', {
    method: 'POST',
    body: data,
    authenticated: false,
  });
}

export async function resendConfirmationCode(
  api: AWSAPIService,
  email: string
): Promise<{
  success: boolean;
  message?: string;
}> {
  return api.request('/auth/resend-code', {
    method: 'POST',
    body: { email },
    authenticated: false,
  });
}

export async function forgotPassword(
  api: AWSAPIService,
  email: string
): Promise<{
  success: boolean;
  message?: string;
}> {
  return api.request('/auth/forgot-password', {
    method: 'POST',
    body: { email },
    authenticated: false,
  });
}

export async function confirmForgotPassword(
  api: AWSAPIService,
  data: {
    email: string;
    code: string;
    newPassword: string;
  }
): Promise<{
  success: boolean;
  message?: string;
}> {
  return api.request('/auth/confirm-forgot-password', {
    method: 'POST',
    body: data,
    authenticated: false,
  });
}
