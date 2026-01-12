/**
 * Supabase Edge Function: Send Push Notification
 *
 * Sends push notifications via Expo Push API for various events:
 * - new_like: Someone liked a post
 * - new_follow: Someone followed a user
 * - new_message: New message received
 * - new_comment: New comment on a post
 *
 * POST /functions/v1/send-notification
 * Body: {
 *   type: 'new_like' | 'new_follow' | 'new_message' | 'new_comment',
 *   recipient_id: string,
 *   data: {
 *     sender_id?: string,
 *     sender_name?: string,
 *     sender_avatar?: string,
 *     post_id?: string,
 *     post_title?: string,
 *     message_preview?: string,
 *     comment_text?: string,
 *   }
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Types
type NotificationType = 'new_like' | 'new_follow' | 'new_message' | 'new_comment';

interface NotificationData {
  sender_id?: string;
  sender_name?: string;
  sender_avatar?: string;
  post_id?: string;
  post_title?: string;
  message_preview?: string;
  comment_text?: string;
}

interface RequestBody {
  type: NotificationType;
  recipient_id: string;
  data: NotificationData;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Expo Push API URL
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Generate notification content based on type
 */
const getNotificationContent = (
  type: NotificationType,
  data: NotificationData
): { title: string; body: string; screen: string; params: Record<string, unknown> } => {
  const senderName = data.sender_name || 'Someone';

  switch (type) {
    case 'new_like':
      return {
        title: 'New Like',
        body: `${senderName} liked your post`,
        screen: 'PostDetail',
        params: { postId: data.post_id },
      };

    case 'new_follow':
      return {
        title: 'New Follower',
        body: `${senderName} started following you`,
        screen: 'UserProfile',
        params: { userId: data.sender_id },
      };

    case 'new_message':
      const messagePreview = data.message_preview
        ? data.message_preview.length > 50
          ? `${data.message_preview.substring(0, 50)}...`
          : data.message_preview
        : 'sent you a message';
      return {
        title: senderName,
        body: messagePreview,
        screen: 'Chat',
        params: { recipientId: data.sender_id },
      };

    case 'new_comment':
      const commentPreview = data.comment_text
        ? data.comment_text.length > 50
          ? `${data.comment_text.substring(0, 50)}...`
          : data.comment_text
        : 'commented on your post';
      return {
        title: 'New Comment',
        body: `${senderName}: ${commentPreview}`,
        screen: 'PostDetail',
        params: { postId: data.post_id },
      };

    default:
      return {
        title: 'Smuppy',
        body: 'You have a new notification',
        screen: 'Notifications',
        params: {},
      };
  }
};

/**
 * Send push notification via Expo Push API
 */
const sendExpoPushNotification = async (
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; error?: string; ticketId?: string }> => {
  try {
    const message: ExpoPushMessage = {
      to: pushToken,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    };

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();

    if (result.data && result.data.status === 'ok') {
      return { success: true, ticketId: result.data.id };
    }

    if (result.data && result.data.status === 'error') {
      return {
        success: false,
        error: result.data.message || 'Failed to send notification',
      };
    }

    return { success: true, ticketId: result.data?.id };
  } catch (error) {
    console.error('Error sending Expo push notification:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Log notification result to database
 */
const logNotification = async (
  supabase: ReturnType<typeof createClient>,
  recipientId: string,
  type: NotificationType,
  success: boolean,
  error?: string
) => {
  try {
    await supabase.from('notification_logs').insert({
      recipient_id: recipientId,
      type,
      success,
      error,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // Don't fail if logging fails
    console.error('Failed to log notification:', e);
  }
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify method
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body: RequestBody = await req.json();
    const { type, recipient_id, data } = body;

    // Validate required fields
    if (!type || !recipient_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: type, recipient_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate notification type
    const validTypes: NotificationType[] = ['new_like', 'new_follow', 'new_message', 'new_comment'];
    if (!validTypes.includes(type)) {
      return new Response(
        JSON.stringify({ error: `Invalid type. Allowed: ${validTypes.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Don't send notification to self
    if (data?.sender_id && data.sender_id === recipient_id) {
      console.log('Skipping self-notification');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'self_notification' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get recipient's push tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token, platform')
      .eq('user_id', recipient_id);

    if (tokenError) {
      console.error('Error fetching push tokens:', tokenError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch push tokens' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tokens || tokens.length === 0) {
      console.log('No push tokens found for recipient:', recipient_id);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'no_tokens' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate notification content
    const { title, body: notifBody, screen, params } = getNotificationContent(type, data);

    // Send notification to all user's devices
    const results = await Promise.all(
      tokens.map(async ({ token }) => {
        const result = await sendExpoPushNotification(token, title, notifBody, {
          type,
          screen,
          ...params,
          ...data,
        });
        return { token, ...result };
      })
    );

    // Log results
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    console.log(`Notification sent: ${successCount} success, ${failedCount} failed`);

    // Log to database
    await logNotification(
      supabase,
      recipient_id,
      type,
      successCount > 0,
      failedCount > 0 ? results.find((r) => !r.success)?.error : undefined
    );

    // Clean up invalid tokens
    const invalidTokens = results
      .filter((r) => r.error?.includes('DeviceNotRegistered') || r.error?.includes('InvalidCredentials'))
      .map((r) => r.token);

    if (invalidTokens.length > 0) {
      console.log('Removing invalid tokens:', invalidTokens.length);
      await supabase
        .from('push_tokens')
        .delete()
        .in('token', invalidTokens);
    }

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        sent: successCount,
        failed: failedCount,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-notification:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
