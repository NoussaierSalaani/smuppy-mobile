/**
 * Supabase Edge Function: Send Push Notification
 *
 * Sends push notifications via Expo Push Notification Service
 *
 * Usage:
 * POST /functions/v1/send-push-notification
 * Body: { userId: string, title: string, body: string, data?: object }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
}

interface RequestBody {
  userId?: string;
  userIds?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
}

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Verify request method
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { userId, userIds, title, body: messageBody, data, channelId } = body;

    // Validate required fields
    if (!title || !messageBody) {
      return new Response(JSON.stringify({ error: 'Missing required fields: title, body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!userId && (!userIds || userIds.length === 0)) {
      return new Response(JSON.stringify({ error: 'Missing userId or userIds' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get target user IDs
    const targetUserIds = userId ? [userId] : userIds!;

    // Fetch push tokens for target users
    const { data: tokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', targetUserIds)
      .eq('is_active', true);

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      return new Response(JSON.stringify({ error: 'Failed to fetch push tokens' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No push tokens found for target users',
        sent: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Prepare push messages
    const messages: PushMessage[] = tokens.map((t) => ({
      to: t.token,
      title,
      body: messageBody,
      data,
      sound: 'default',
      channelId: channelId || 'default',
      priority: 'high',
    }));

    // Send to Expo Push Service
    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const pushResult = await pushResponse.json();

    // Check for invalid tokens and deactivate them
    if (pushResult.data) {
      const invalidTokens: string[] = [];

      pushResult.data.forEach((result: { status: string; message?: string }, index: number) => {
        if (result.status === 'error' && result.message?.includes('DeviceNotRegistered')) {
          invalidTokens.push(tokens[index].token);
        }
      });

      // Deactivate invalid tokens
      if (invalidTokens.length > 0) {
        await supabase
          .from('push_tokens')
          .update({ is_active: false })
          .in('token', invalidTokens);
      }
    }

    // Create notification records for each user
    for (const targetUserId of targetUserIds) {
      await supabase.from('notifications').insert({
        user_id: targetUserId,
        type: data?.type || 'default',
        title,
        body: messageBody,
        data,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      sent: messages.length,
      result: pushResult,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error sending push notification:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
