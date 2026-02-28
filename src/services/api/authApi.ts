import type { AWSAPIService } from '../aws-api';
import type { Result } from '../result';
import { ok, err } from '../result';

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
): Promise<Result<{ success: boolean; message?: string }>> {
  try {
    const resp = await api.request<{ success: boolean; message?: string }>('/auth/confirm-signup', {
      method: 'POST',
      body: data,
      authenticated: false,
    });
    return ok(resp);
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number }).statusCode;
    return err('AUTH_CONFIRM_SIGNUP_FAILED', 'Failed to confirm signup', { statusCode });
  }
}

export async function resendConfirmationCode(
  api: AWSAPIService,
  email: string
): Promise<Result<{ success: boolean; message?: string }>> {
  try {
    const data = await api.request<{ success: boolean; message?: string }>('/auth/resend-code', {
      method: 'POST',
      body: { email },
      authenticated: false,
    });
    return ok(data);
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number }).statusCode;
    return err('AUTH_RESEND_CODE_FAILED', 'Failed to resend confirmation code', { statusCode });
  }
}

export async function forgotPassword(
  api: AWSAPIService,
  email: string
): Promise<Result<{ success: boolean; message?: string }>> {
  try {
    const data = await api.request<{ success: boolean; message?: string }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      authenticated: false,
    });
    return ok(data);
  } catch (e: unknown) {
    const statusCode = (e as { statusCode?: number }).statusCode;
    return err('AUTH_FORGOT_PASSWORD_FAILED', 'Failed to request password reset', { statusCode });
  }
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
