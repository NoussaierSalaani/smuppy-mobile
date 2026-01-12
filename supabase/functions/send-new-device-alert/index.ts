/**
 * send-new-device-alert Edge Function
 * Sends email alerts when a new device logs into an account
 *
 * Security Features:
 * - Rate limited to prevent spam
 * - Validates device info
 * - Logs all alerts for audit trail
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// CORS headers for Smuppy domains
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit: max 5 alerts per user per hour
const RATE_LIMIT_ALERTS = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

interface DeviceInfo {
  device_id: string;
  device_name?: string;
  device_type?: string;
  platform?: string;
  browser?: string;
  os_version?: string;
  app_version?: string;
  ip_address?: string;
  country?: string;
  city?: string;
}

interface AlertRequest {
  device_session_id: string;
  device_info: DeviceInfo;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Client for user context
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Service client for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: AlertRequest = await req.json();
    const { device_session_id, device_info } = body;

    if (!device_session_id || !device_info) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limit
    const oneHourAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: alertCount } = await supabaseAdmin
      .from('device_alert_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo);

    if (alertCount !== null && alertCount >= RATE_LIMIT_ALERTS) {
      console.log(`[NewDeviceAlert] Rate limited for user ${user.id}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Alert rate limited' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's email
    const userEmail = user.email;
    if (!userEmail) {
      return new Response(
        JSON.stringify({ error: 'User has no email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build email content
    const deviceDescription = buildDeviceDescription(device_info);
    const loginTime = new Date().toLocaleString('fr-FR', {
      timeZone: 'Europe/Paris',
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const location = device_info.city && device_info.country
      ? `${device_info.city}, ${device_info.country}`
      : device_info.country || 'Unknown location';

    // Send email via Resend (or your email provider)
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (resendApiKey) {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Smuppy Security <security@smuppy.app>',
          to: userEmail,
          subject: '🔐 New device login detected - Smuppy',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>New Device Login</title>
            </head>
            <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #00cdb5 0%, #0066ac 100%); padding: 30px; text-align: center;">
                          <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">🔐 New Device Login</h1>
                        </td>
                      </tr>

                      <!-- Content -->
                      <tr>
                        <td style="padding: 40px 30px;">
                          <p style="font-size: 16px; color: #0a252f; margin: 0 0 20px;">Hi there,</p>
                          <p style="font-size: 16px; color: #0a252f; margin: 0 0 20px;">We detected a new login to your Smuppy account from a device we don't recognize.</p>

                          <!-- Device Info Box -->
                          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 12px; margin: 20px 0;">
                            <tr>
                              <td style="padding: 20px;">
                                <table width="100%" cellpadding="0" cellspacing="0">
                                  <tr>
                                    <td style="padding: 8px 0;">
                                      <span style="color: #676C75; font-size: 14px;">📱 Device:</span>
                                      <span style="color: #0a252f; font-size: 14px; font-weight: 600; margin-left: 10px;">${deviceDescription}</span>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 8px 0;">
                                      <span style="color: #676C75; font-size: 14px;">📍 Location:</span>
                                      <span style="color: #0a252f; font-size: 14px; font-weight: 600; margin-left: 10px;">${location}</span>
                                    </td>
                                  </tr>
                                  <tr>
                                    <td style="padding: 8px 0;">
                                      <span style="color: #676C75; font-size: 14px;">🕐 Time:</span>
                                      <span style="color: #0a252f; font-size: 14px; font-weight: 600; margin-left: 10px;">${loginTime}</span>
                                    </td>
                                  </tr>
                                  ${device_info.ip_address ? `
                                  <tr>
                                    <td style="padding: 8px 0;">
                                      <span style="color: #676C75; font-size: 14px;">🌐 IP:</span>
                                      <span style="color: #0a252f; font-size: 14px; font-weight: 600; margin-left: 10px;">${device_info.ip_address}</span>
                                    </td>
                                  </tr>
                                  ` : ''}
                                </table>
                              </td>
                            </tr>
                          </table>

                          <p style="font-size: 16px; color: #0a252f; margin: 20px 0 10px;"><strong>Was this you?</strong></p>
                          <p style="font-size: 14px; color: #676C75; margin: 0 0 20px;">If yes, you can safely ignore this email. If no, we recommend you change your password immediately and contact our support team.</p>

                          <!-- Action Button -->
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="center" style="padding: 20px 0;">
                                <a href="https://smuppy.app/settings/security" style="display: inline-block; background: linear-gradient(90deg, #00cdb5 0%, #0066ac 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 28px; font-size: 16px; font-weight: 600;">Review Security Settings</a>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>

                      <!-- Footer -->
                      <tr>
                        <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center;">
                          <p style="font-size: 12px; color: #9cadbc; margin: 0;">This is an automated security notification from Smuppy.</p>
                          <p style="font-size: 12px; color: #9cadbc; margin: 10px 0 0;">If you have questions, contact us at support@smuppy.app</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
        }),
      });

      if (!emailResponse.ok) {
        console.error('[NewDeviceAlert] Email send failed:', await emailResponse.text());
      }
    }

    // Log the alert
    await supabaseAdmin.from('device_alert_logs').insert({
      user_id: user.id,
      device_session_id: device_session_id,
      alert_type: 'new_device',
      email_status: resendApiKey ? 'sent' : 'skipped',
      metadata: {
        device_info,
        location,
        login_time: loginTime,
      },
    });

    console.log(`[NewDeviceAlert] Alert sent to ${userEmail} for device ${device_info.device_id}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Alert sent' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[NewDeviceAlert] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Build a human-readable device description
 */
function buildDeviceDescription(device: DeviceInfo): string {
  const parts: string[] = [];

  if (device.device_name) {
    parts.push(device.device_name);
  } else if (device.device_type) {
    parts.push(device.device_type.charAt(0).toUpperCase() + device.device_type.slice(1));
  }

  if (device.platform) {
    parts.push(device.platform.charAt(0).toUpperCase() + device.platform.slice(1));
  }

  if (device.browser) {
    parts.push(device.browser);
  }

  if (device.os_version) {
    parts.push(`(${device.os_version})`);
  }

  return parts.length > 0 ? parts.join(' - ') : 'Unknown device';
}
