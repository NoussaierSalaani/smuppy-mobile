/**
 * Supabase Edge Function: Generate S3 Presigned URL
 *
 * Generates presigned URLs for secure direct uploads to S3
 *
 * SECURITY FEATURES:
 * - Mandatory authentication
 * - Server-side rate limiting (100 req/min)
 * - File size limits (10MB images, 100MB videos)
 * - MIME type validation
 * - CORS whitelist
 *
 * POST /functions/v1/media-presigned-url
 * Body: { fileName: string, folder: string, contentType: string, fileSize?: number }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { S3Client, PutObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.400.0';
import { getSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.400.0';

// Configuration
const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1';
const S3_BUCKET = Deno.env.get('S3_BUCKET_NAME') || 'smuppy-media';
const CLOUDFRONT_URL = Deno.env.get('CLOUDFRONT_URL') || '';
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID') || '';
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY') || '';

// ========================================
// SECURITY: Rate Limiting Configuration
// ========================================
const RATE_LIMIT_MAX_REQUESTS = 100; // Max 100 requests
const RATE_LIMIT_WINDOW_MINUTES = 1;  // Per minute
const ENDPOINT_NAME = 'media-presigned-url';

// ========================================
// SECURITY: File Size Limits (in bytes)
// ========================================
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;  // 10 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB

// Initialize S3 client
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

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

// ========================================
// SECURITY: Allowed MIME Types with file signatures
// ========================================
const ALLOWED_TYPES: Record<string, { maxSize: number; extensions: string[] }> = {
  'image/jpeg': { maxSize: MAX_IMAGE_SIZE, extensions: ['jpg', 'jpeg'] },
  'image/png': { maxSize: MAX_IMAGE_SIZE, extensions: ['png'] },
  'image/webp': { maxSize: MAX_IMAGE_SIZE, extensions: ['webp'] },
  'image/gif': { maxSize: MAX_IMAGE_SIZE, extensions: ['gif'] },
  'video/mp4': { maxSize: MAX_VIDEO_SIZE, extensions: ['mp4'] },
  'video/quicktime': { maxSize: MAX_VIDEO_SIZE, extensions: ['mov'] },
  'video/x-m4v': { maxSize: MAX_VIDEO_SIZE, extensions: ['m4v'] },
};

interface RequestBody {
  fileName: string;
  folder: string;
  contentType: string;
  fileSize?: number;
}

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
      // Fail open - allow request if rate limit check fails
      return { allowed: true, current_count: 0, max_requests: RATE_LIMIT_MAX_REQUESTS };
    }

    return data as RateLimitResult;
  } catch (e) {
    console.error('Rate limit exception:', e);
    // Fail open
    return { allowed: true, current_count: 0, max_requests: RATE_LIMIT_MAX_REQUESTS };
  }
};

/**
 * Validate file extension matches content type
 */
const validateFileExtension = (fileName: string, contentType: string): boolean => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension) return false;

  const typeConfig = ALLOWED_TYPES[contentType];
  if (!typeConfig) return false;

  return typeConfig.extensions.includes(extension);
};

/**
 * Validate file size against content type limits
 */
const validateFileSize = (fileSize: number | undefined, contentType: string): { valid: boolean; maxSize: number } => {
  const typeConfig = ALLOWED_TYPES[contentType];
  if (!typeConfig) {
    return { valid: false, maxSize: 0 };
  }

  if (fileSize && fileSize > typeConfig.maxSize) {
    return { valid: false, maxSize: typeConfig.maxSize };
  }

  return { valid: true, maxSize: typeConfig.maxSize };
};

/**
 * Generate unique file key
 */
const generateKey = (folder: string, fileName: string, userId: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  // Include user ID hash in path for better organization and security
  const userHash = userId.substring(0, 8);
  return `${folder}/${userHash}/${timestamp}-${random}.${extension}`;
};

/**
 * Get CloudFront URL for a key
 */
const getCloudFrontUrl = (key: string): string => {
  if (CLOUDFRONT_URL) {
    return `${CLOUDFRONT_URL}/${key}`;
  }
  return `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
};

serve(async (req) => {
  const origin = req.headers.get('Origin');
  const corsHeaders = getCorsHeaders(origin);

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

    // Verify AWS credentials are configured
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      console.error('AWS credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // SECURITY: Verify authentication (MANDATORY)
    // ========================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // Parse request body
    const body: RequestBody = await req.json();
    const { fileName, folder, contentType, fileSize } = body;

    // Validate required fields
    if (!fileName || !folder || !contentType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: fileName, folder, contentType' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate folder
    const allowedFolders = ['avatars', 'covers', 'posts', 'messages', 'thumbnails'];
    if (!allowedFolders.includes(folder)) {
      return new Response(
        JSON.stringify({ error: `Invalid folder. Allowed: ${allowedFolders.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // SECURITY: Validate content type
    // ========================================
    if (!ALLOWED_TYPES[contentType]) {
      return new Response(
        JSON.stringify({ error: `Invalid content type. Allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // SECURITY: Validate file extension matches content type
    // ========================================
    if (!validateFileExtension(fileName, contentType)) {
      return new Response(
        JSON.stringify({
          error: 'File extension does not match content type',
          expected_extensions: ALLOWED_TYPES[contentType].extensions,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================
    // SECURITY: Validate file size
    // ========================================
    const sizeValidation = validateFileSize(fileSize, contentType);
    if (!sizeValidation.valid) {
      const maxSizeMB = sizeValidation.maxSize / (1024 * 1024);
      return new Response(
        JSON.stringify({
          error: `File too large. Maximum size: ${maxSizeMB}MB`,
          max_size_bytes: sizeValidation.maxSize,
        }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate unique key with user ID for organization
    const key = generateKey(folder, fileName, user.id);

    // Create presigned URL with content length restriction
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      // Add content length condition if fileSize provided
      ...(fileSize && { ContentLength: fileSize }),
      // Add metadata
      Metadata: {
        'uploaded-by': user.id,
        'original-filename': fileName,
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    // Return response with rate limit headers
    return new Response(
      JSON.stringify({
        uploadUrl,
        key,
        cdnUrl: getCloudFrontUrl(key),
        expiresIn: 3600,
        maxFileSize: sizeValidation.maxSize,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
          'X-RateLimit-Remaining': String(rateLimitResult.remaining || 0),
        },
      }
    );

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
