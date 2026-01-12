/**
 * Supabase Edge Function: Generate S3 Presigned URL
 *
 * Generates presigned URLs for secure direct uploads to S3
 *
 * POST /functions/v1/media-presigned-url
 * Body: { fileName: string, folder: string, contentType: string }
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

// Initialize S3 client
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  fileName: string;
  folder: string;
  contentType: string;
}

/**
 * Generate unique file key
 */
const generateKey = (folder: string, fileName: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = fileName.split('.').pop() || 'jpg';
  return `${folder}/${timestamp}-${random}.${extension}`;
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

    // Optional: Verify user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { fileName, folder, contentType } = body;

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

    // Validate content type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/quicktime', 'video/x-m4v'
    ];
    if (!allowedTypes.includes(contentType)) {
      return new Response(
        JSON.stringify({ error: `Invalid content type. Allowed: ${allowedTypes.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate unique key
    const key = generateKey(folder, fileName);

    // Create presigned URL
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    // Return response
    return new Response(
      JSON.stringify({
        uploadUrl,
        key,
        cdnUrl: getCloudFrontUrl(key),
        expiresIn: 3600,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
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
