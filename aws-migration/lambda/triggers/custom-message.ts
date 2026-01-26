/**
 * Custom Message Lambda Trigger
 * Customizes all Cognito email messages for professional delivery
 *
 * Triggered for:
 * - CustomMessage_SignUp (email verification)
 * - CustomMessage_ForgotPassword (password reset)
 * - CustomMessage_ResendCode (resend verification)
 * - CustomMessage_AdminCreateUser (admin created user)
 */

import { CustomMessageTriggerEvent, CustomMessageTriggerHandler } from 'aws-lambda';

// Smuppy brand colors
const SMUPPY_GREEN = '#0EBF8A';
const SMUPPY_TEAL = '#00B3C7';
const SMUPPY_LIGHT_GREEN = '#72D1AD';

// Smuppy logo as SVG (inline for email compatibility)
const SMUPPY_LOGO = `
<svg width="120" height="40" viewBox="0 0 120 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="smuppyGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#00B3C7;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#0EBF8A;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#72D1AD;stop-opacity:1" />
    </linearGradient>
  </defs>
  <text x="0" y="30" font-family="Arial Black, sans-serif" font-size="32" font-weight="900" fill="url(#smuppyGrad)">Smuppy</text>
</svg>`;

// Professional HTML email template generator with Smuppy branding
const generateEmailTemplate = (
  title: string,
  subtitle: string,
  code: string,
  message: string,
  footer: string
): string => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <!-- Logo -->
          <tr>
            <td style="padding: 40px 40px 20px 40px; text-align: center;">
              <h1 style="margin: 0; font-size: 36px; font-weight: 900; background: linear-gradient(90deg, ${SMUPPY_TEAL} 0%, ${SMUPPY_GREEN} 50%, ${SMUPPY_LIGHT_GREEN} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Smuppy</h1>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td style="padding: 0 40px 10px 40px; text-align: center;">
              <h2 style="margin: 0; color: #1f2937; font-size: 24px; font-weight: 600;">${title}</h2>
            </td>
          </tr>
          <!-- Subtitle -->
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 16px; line-height: 24px;">
                ${subtitle}
              </p>
            </td>
          </tr>
          <!-- Code Box with Smuppy gradient -->
          <tr>
            <td style="padding: 0 40px 20px 40px; text-align: center;">
              <div style="background: linear-gradient(135deg, ${SMUPPY_TEAL} 0%, ${SMUPPY_GREEN} 100%); border-radius: 12px; padding: 28px;">
                <span style="font-size: 40px; font-weight: bold; color: #ffffff; letter-spacing: 10px; font-family: monospace;">${code}</span>
              </div>
            </td>
          </tr>
          <!-- Message -->
          <tr>
            <td style="padding: 0 40px 30px 40px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 22px;">
                ${message}
              </p>
            </td>
          </tr>
          <!-- Security Notice with Smuppy green -->
          <tr>
            <td style="padding: 0 40px 30px 40px;">
              <div style="background-color: #E6FAF8; border-radius: 8px; padding: 16px; border-left: 4px solid ${SMUPPY_GREEN};">
                <p style="margin: 0; color: #065f46; font-size: 13px; line-height: 20px;">
                  <strong>Security tip:</strong> Never share this code with anyone. Smuppy will never ask for your code via phone, text, or email.
                </p>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 12px;">
                ${footer}
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © 2026 Smuppy. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
        <!-- Unsubscribe -->
        <table role="presentation" style="width: 100%; max-width: 600px; border-collapse: collapse; margin-top: 20px;">
          <tr>
            <td style="text-align: center;">
              <p style="margin: 0; color: #9ca3af; font-size: 11px;">
                This is an automated message. Please do not reply to this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const handler: CustomMessageTriggerHandler = async (
  event: CustomMessageTriggerEvent
): Promise<CustomMessageTriggerEvent> => {
  const { triggerSource, request, response } = event;
  const code = request.codeParameter || '{####}';
  const userEmail = request.userAttributes?.email || 'User';

  // SECURITY: Mask email in logs to prevent PII exposure
  const maskedEmail = userEmail.includes('@')
    ? userEmail.substring(0, 2) + '***@' + userEmail.split('@')[1]
    : userEmail;
  console.log('[CustomMessage] Trigger:', triggerSource, 'User:', maskedEmail);

  switch (triggerSource) {
    case 'CustomMessage_SignUp':
      response.emailSubject = 'Welcome to Smuppy - Verify Your Email';
      response.emailMessage = generateEmailTemplate(
        'Verify Your Email',
        'Welcome to Smuppy! Enter this code in the app to verify your email address and complete your registration.',
        code,
        'This code expires in 24 hours. If you didn\'t create an account, you can safely ignore this email.',
        'You\'re receiving this because you created a Smuppy account.'
      );
      break;

    case 'CustomMessage_ResendCode':
      response.emailSubject = 'Smuppy - Your New Verification Code';
      response.emailMessage = generateEmailTemplate(
        'New Verification Code',
        'Here\'s your new verification code. Enter it in the app to complete your registration.',
        code,
        'This code expires in 24 hours. Previous codes are no longer valid.',
        'You requested a new verification code for your Smuppy account.'
      );
      break;

    case 'CustomMessage_ForgotPassword':
      response.emailSubject = 'Smuppy - Reset Your Password';
      response.emailMessage = generateEmailTemplate(
        'Reset Your Password',
        'We received a request to reset your password. Use this code to create a new password.',
        code,
        'This code expires in 1 hour. If you didn\'t request a password reset, please ignore this email or contact support if you\'re concerned.',
        'You requested a password reset for your Smuppy account.'
      );
      break;

    case 'CustomMessage_AdminCreateUser':
      response.emailSubject = 'Welcome to Smuppy - Your Account is Ready';
      response.emailMessage = generateEmailTemplate(
        'Your Account is Ready',
        'An account has been created for you on Smuppy. Use this temporary password to sign in.',
        code,
        'You\'ll be asked to change your password when you first sign in.',
        'This account was created by a Smuppy administrator.'
      );
      break;

    case 'CustomMessage_UpdateUserAttribute':
      response.emailSubject = 'Smuppy - Verify Your New Email';
      response.emailMessage = generateEmailTemplate(
        'Verify New Email',
        'You\'ve requested to change your email address. Enter this code to verify your new email.',
        code,
        'This code expires in 24 hours. If you didn\'t make this change, please contact support immediately.',
        'You requested to update your email on Smuppy.'
      );
      break;

    case 'CustomMessage_VerifyUserAttribute':
      response.emailSubject = 'Smuppy - Verification Code';
      response.emailMessage = generateEmailTemplate(
        'Verification Code',
        'Use this code to verify your information.',
        code,
        'This code expires in 24 hours.',
        'You requested verification on Smuppy.'
      );
      break;

    default:
      console.log('[CustomMessage] Unknown trigger source:', triggerSource);
      // Use default message for unknown triggers
      response.emailSubject = 'Smuppy - Verification Code';
      response.emailMessage = generateEmailTemplate(
        'Verification Code',
        'Here is your verification code.',
        code,
        'This code expires in 24 hours.',
        'You received this email from Smuppy.'
      );
  }

  return event;
};
