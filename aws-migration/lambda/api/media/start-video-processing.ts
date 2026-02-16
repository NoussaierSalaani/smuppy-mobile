/**
 * Start Video Processing Lambda Handler
 * Triggered asynchronously after a post/peak with video is created.
 * Creates a MediaConvert job for HLS transcoding + thumbnail extraction.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  MediaConvertClient,
  CreateJobCommand,
  CreateJobCommandInput,
} from '@aws-sdk/client-mediaconvert';
import { getPool } from '../../shared/db';
import { createHeaders } from '../utils/cors';
import { createLogger } from '../utils/logger';
import { isValidUUID } from '../utils/security';

const log = createLogger('media-start-video-processing');

// Validate environment at module load
const MEDIA_CONVERT_ENDPOINT = process.env.MEDIA_CONVERT_ENDPOINT;
const MEDIA_CONVERT_ROLE_ARN = process.env.MEDIA_CONVERT_ROLE_ARN;
const MEDIA_BUCKET = process.env.MEDIA_BUCKET;
const MEDIA_CONVERT_QUEUE_ARN = process.env.MEDIA_CONVERT_QUEUE_ARN;

if (!MEDIA_CONVERT_ENDPOINT) throw new Error('MEDIA_CONVERT_ENDPOINT is required');
if (!MEDIA_CONVERT_ROLE_ARN) throw new Error('MEDIA_CONVERT_ROLE_ARN is required');
if (!MEDIA_BUCKET) throw new Error('MEDIA_BUCKET is required');

const mediaConvertClient = new MediaConvertClient({
  endpoint: MEDIA_CONVERT_ENDPOINT,
});

// HLS transcoding presets — 3 renditions for adaptive bitrate
const HLS_OUTPUT_GROUPS = {
  '480p': { width: 854, height: 480, bitrate: 1_500_000, maxBitrate: 2_000_000 },
  '720p': { width: 1280, height: 720, bitrate: 3_000_000, maxBitrate: 4_000_000 },
  '1080p': { width: 1920, height: 1080, bitrate: 5_000_000, maxBitrate: 7_000_000 },
};

/**
 * Build a MediaConvert job spec for HLS + thumbnail output.
 */
function buildJobSpec(
  sourceKey: string,
  outputPrefix: string,
  entityType: string,
  entityId: string,
): CreateJobCommandInput {
  const inputS3Uri = `s3://${MEDIA_BUCKET}/${sourceKey}`;
  const outputS3Uri = `s3://${MEDIA_BUCKET}/${outputPrefix}`;

  const hlsOutputs = Object.entries(HLS_OUTPUT_GROUPS).map(([label, preset]) => ({
    ContainerSettings: { Container: 'M3U8' as const },
    NameModifier: `_${label}`,
    VideoDescription: {
      Width: preset.width,
      Height: preset.height,
      CodecSettings: {
        Codec: 'H_264' as const,
        H264Settings: {
          RateControlMode: 'QVBR' as const,
          MaxBitrate: preset.maxBitrate,
          QvbrSettings: { QvbrQualityLevel: 7 },
          CodecProfile: 'HIGH' as const,
          CodecLevel: 'AUTO' as const,
          GopSize: 2,
          GopSizeUnits: 'SECONDS' as const,
        },
      },
      ScalingBehavior: 'DEFAULT' as const,
      AntiAlias: 'ENABLED' as const,
    },
    AudioDescriptions: [{
      CodecSettings: {
        Codec: 'AAC' as const,
        AacSettings: {
          Bitrate: 128000,
          CodingMode: 'CODING_MODE_2_0' as const,
          SampleRate: 48000,
        },
      },
    }],
  }));

  return {
    Role: MEDIA_CONVERT_ROLE_ARN,
    ...(MEDIA_CONVERT_QUEUE_ARN ? { Queue: MEDIA_CONVERT_QUEUE_ARN } : {}),
    Settings: {
      Inputs: [{
        FileInput: inputS3Uri,
        AudioSelectors: { 'Audio Selector 1': { DefaultSelection: 'DEFAULT' as const } },
        VideoSelector: {},
      }],
      OutputGroups: [
        // HLS output group
        {
          Name: 'HLS',
          OutputGroupSettings: {
            Type: 'HLS_GROUP_SETTINGS' as const,
            HlsGroupSettings: {
              Destination: `${outputS3Uri}hls/`,
              SegmentLength: 6,
              MinSegmentLength: 0,
              ManifestCompression: 'NONE' as const,
            },
          },
          Outputs: hlsOutputs,
        },
        // Thumbnail output group
        {
          Name: 'Thumbnails',
          OutputGroupSettings: {
            Type: 'FILE_GROUP_SETTINGS' as const,
            FileGroupSettings: {
              Destination: `${outputS3Uri}thumbnails/`,
            },
          },
          Outputs: [{
            ContainerSettings: { Container: 'RAW' as const },
            VideoDescription: {
              Width: 640,
              Height: 360,
              CodecSettings: {
                Codec: 'FRAME_CAPTURE' as const,
                FrameCaptureSettings: {
                  FramerateNumerator: 1,
                  FramerateDenominator: 1,
                  MaxCaptures: 3,
                  Quality: 80,
                },
              },
            },
          }],
        },
      ],
    },
    // Tags for tracking: used by completion handler to update the correct entity
    UserMetadata: {
      entityType,
      entityId,
      sourceKey,
    },
  };
}

/**
 * Internal handler — invoked asynchronously (Lambda.invoke with InvocationType: Event)
 * Body: { entityType: 'post'|'peak', entityId: UUID, sourceKey: string }
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const headers = createHeaders(event);
  log.initFromEvent(event);

  try {
    // This handler is invoked internally — no auth check needed (Lambda-to-Lambda)
    if (!event.body) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Missing body' }) };
    }

    let body: { entityType: string; entityId: string; sourceKey: string };
    try {
      body = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid JSON body' }) };
    }

    const { entityType, entityId, sourceKey } = body;

    // Validate
    if (!entityType || !['post', 'peak'].includes(entityType)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'entityType must be post or peak' }) };
    }
    if (!entityId || !isValidUUID(entityId)) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid entityId' }) };
    }
    if (!sourceKey || typeof sourceKey !== 'string' || sourceKey.length > 1024) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, message: 'Invalid sourceKey' }) };
    }

    // Output prefix: video-processed/{entityType}/{entityId}/
    const outputPrefix = `video-processed/${entityType}/${entityId}/`;

    log.info('Starting video processing', { entityType, entityId: entityId.substring(0, 8) + '...' });

    // Create MediaConvert job
    const jobSpec = buildJobSpec(sourceKey, outputPrefix, entityType, entityId);
    const result = await mediaConvertClient.send(new CreateJobCommand(jobSpec));

    const mediaConvertJobId = result.Job?.Id;
    if (!mediaConvertJobId) {
      throw new Error('MediaConvert returned no job ID');
    }

    log.info('MediaConvert job created', { jobId: mediaConvertJobId });

    // Record in DB for status tracking
    const db = await getPool();
    await db.query(
      `INSERT INTO video_processing_jobs (media_convert_job_id, source_key, output_prefix, entity_type, entity_id, status)
       VALUES ($1, $2, $3, $4, $5, 'submitted')
       ON CONFLICT (media_convert_job_id) DO NOTHING`,
      [mediaConvertJobId, sourceKey, outputPrefix, entityType, entityId]
    );

    // Update entity status to 'processing'
    if (entityType === 'post') {
      await db.query(
        `UPDATE posts SET video_status = 'processing', updated_at = NOW() WHERE id = $1`,
        [entityId]
      );
    } else {
      await db.query(
        `UPDATE peaks SET video_status = 'processing', updated_at = NOW() WHERE id = $1`,
        [entityId]
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        jobId: mediaConvertJobId,
        status: 'processing',
      }),
    };
  } catch (error: unknown) {
    log.error('Error starting video processing', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: 'Failed to start video processing' }),
    };
  }
}
