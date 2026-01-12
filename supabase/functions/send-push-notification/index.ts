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

// ========================================
// SECURITY: Rate Limiting Configuration
// ========================================
const RATE_LIMIT_MAX_REQUESTS = 50; // Max 50 requests
const RATE_LIMIT_WINDOW_MINUTES = 1;  // Per minute
const ENDPOINT_NAME = 'send-push-notification';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://smuppy.com',
  'https://www.smuppy.com',
  'https://app.smuppy.com',
  'http://localhost:8081', // Expo dev
  'http://localhost:19006', // Expo web
];

// Get CORS headers with origin validation
const getCorsHeaders = (origin: string | null) => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Credentials': 'true',
  };
};

interface RateLimitResult {
  allowed: boolean;
  current_count: number;
  max_requests: number;
  remaining?: number;
  retry_after?: number;
  message?: string;
}

/**
 * Check rate limit using Supabase function
 */
const checkRateLimit = async (
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<RateLimitResult> => {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_user_id: userId,
      p_endpoint: ENDPOINT_NAME,
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
      p_window_minutes: RATE_LIMIT_WINDOW_MINUTES,
    });

    if (error) {
      console.error('Rate limit check error:', error);
      return { allowed: true, current_count: 0, max_requests: RATE_LIMIT_MAX_REQUESTS };
    }

    return data as RateLimitResult;
  } catch (e) {
    console.error('Rate limit exception:', e);
    return { allowed: true, current_count: 0, max_requests: RATE_LIMIT_MAX_REQUESTS };
  }
};

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify request method
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ========================================
    // SECURITY: Verify authentication (MANDATORY)
    // ========================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // ========================================

    // ========================================
    // SECURITY: Check rate limit
    // ========================================
    const rateLimitResult = await checkRateLimit(supabase, user.id);

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          retry_after: rateLimitResult.retry_after,
          message: `Too many requests. Max ${RATE_LIMIT_MAX_REQUESTS} per minute.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(rateLimitResult.retry_after || 60),
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }
    // ========================================

    // Parse request body
    const body: RequestBody = await req.json();
    const { userId, userIds, title, body: messageBody, data, channelId } = body;

    // Validate required fields
    if (!title || !messageBody) {
      return new Response(JSON.stringify({ error: 'Missing required fields: title, body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!userId && (!userIds || userIds.length === 0)) {
      return new Response(JSON.stringify({ error: 'Missing userId or userIds' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No push tokens found for target users',
        sent: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error sending push notification:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
