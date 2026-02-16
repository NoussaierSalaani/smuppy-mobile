/**
 * Image Optimizer Lambda Handler
 * Triggered by EventBridge on S3 PutObject for media uploads.
 * Generates optimized image variants (large/medium/thumb), strips EXIF,
 * computes blurhash, and updates posts.media_meta or profiles avatar/cover blurhash.
 *
 * Variants:
 * - large/  — 1080px wide, q85, JPEG, EXIF stripped
 * - medium/ — 540px wide, q80, JPEG, EXIF stripped
 * - thumb/  — 270px wide, q75, WebP, EXIF stripped
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getPool } from '../../shared/db';
import { createLogger } from '../utils/logger';
import sharp from 'sharp';
import { encode } from 'blurhash';

const log = createLogger('image-optimizer');

const s3Client = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const MEDIA_BUCKET = process.env.MEDIA_BUCKET || '';

// Image extensions we process
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic']);

// Variant prefixes to skip (prevent recursion)
const VARIANT_PREFIXES = ['large/', 'medium/', 'thumb/'];

// Variant configurations
const VARIANTS = [
  { name: 'large', width: 1080, quality: 85, format: 'jpeg' as const },
  { name: 'medium', width: 540, quality: 80, format: 'jpeg' as const },
  { name: 'thumb', width: 270, quality: 75, format: 'webp' as const },
] as const;

// Blurhash computation dimensions
const BLURHASH_WIDTH = 32;
const BLURHASH_HEIGHT = 32;
const BLURHASH_X_COMPONENTS = 4;
const BLURHASH_Y_COMPONENTS = 3;

interface EventBridgeS3Event {
  detail: {
    bucket: { name: string };
    object: { key: string; size: number };
  };
}

/**
 * Determine the S3 prefix category from an object key.
 * Returns 'posts', 'peaks', or 'users', or null if not a recognized prefix.
 */
function getKeyCategory(key: string): 'posts' | 'peaks' | 'users' | null {
  if (key.startsWith('posts/')) return 'posts';
  if (key.startsWith('peaks/')) return 'peaks';
  if (key.startsWith('users/')) return 'users';
  return null;
}

/**
 * Extract user ID from S3 key.
 * Keys follow: {prefix}/{userId}/{filename} or {prefix}/{userId}/{variant}/{filename}
 */
function extractUserId(key: string): string | null {
  const parts = key.split('/');
  // e.g. posts/abc123/photo.jpg → parts[1] = 'abc123'
  return parts.length >= 3 ? parts[1] : null;
}

/**
 * Check if the key is already a variant (inside large/, medium/, or thumb/ subfolder).
 * Pattern: posts/{userId}/large/photo.jpg
 */
function isVariantKey(key: string): boolean {
  const parts = key.split('/');
  // Check if any segment after the prefix matches a variant name
  for (let i = 2; i < parts.length - 1; i++) {
    if (VARIANT_PREFIXES.some(vp => vp.startsWith(parts[i] + '/'))) {
      return true;
    }
  }
  return false;
}

/**
 * Build variant S3 key from original key and variant name.
 * posts/{userId}/photo.jpg → posts/{userId}/{variant}/photo.{ext}
 */
function buildVariantKey(originalKey: string, variantName: string, extension: string): string {
  const parts = originalKey.split('/');
  const filename = parts[parts.length - 1];
  const baseName = filename.substring(0, filename.lastIndexOf('.'));
  const prefix = parts.slice(0, parts.length - 1).join('/');
  return `${prefix}/${variantName}/${baseName}${extension}`;
}

export async function handler(event: EventBridgeS3Event): Promise<void> {
  const bucketName = event.detail.bucket.name;
  const objectKey = decodeURIComponent(event.detail.object.key.replace(/\+/g, ' '));
  const fileSize = event.detail.object.size;

  const extension = objectKey.substring(objectKey.lastIndexOf('.')).toLowerCase();
  const isImage = IMAGE_EXTENSIONS.has(extension);

  // Skip non-image files
  if (!isImage) {
    log.info('Skipping non-image file', { objectKey, extension });
    return;
  }

  // Skip variant keys (prevent infinite recursion)
  if (isVariantKey(objectKey)) {
    log.info('Skipping variant key', { objectKey });
    return;
  }

  const category = getKeyCategory(objectKey);
  if (!category) {
    log.info('Skipping unrecognized prefix', { objectKey });
    return;
  }

  // Skip very large files (Sharp has memory limits)
  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
  if (fileSize > MAX_FILE_SIZE) {
    log.warn('Skipping oversized image', { objectKey, fileSize });
    return;
  }

  log.info('Processing image', { objectKey, category, fileSize });

  try {
    // 1. Download original from S3
    const getResult = await s3Client.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    }));

    const bodyBytes = await getResult.Body?.transformToByteArray();
    if (!bodyBytes || bodyBytes.length === 0) {
      log.warn('Empty image body', { objectKey });
      return;
    }

    const inputBuffer = Buffer.from(bodyBytes);

    // 2. Get image metadata for dimensions
    const metadata = await sharp(inputBuffer).metadata();
    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    // 3. Generate blurhash from small downscaled version
    const blurhashBuffer = await sharp(inputBuffer)
      .resize(BLURHASH_WIDTH, BLURHASH_HEIGHT, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const blurhashString = encode(
      new Uint8ClampedArray(blurhashBuffer.data),
      blurhashBuffer.info.width,
      blurhashBuffer.info.height,
      BLURHASH_X_COMPONENTS,
      BLURHASH_Y_COMPONENTS,
    );

    // 4. Generate and upload variants
    const variantKeys: Record<string, string> = {};

    for (const variant of VARIANTS) {
      // Skip if original is smaller than variant target
      if (originalWidth > 0 && originalWidth <= variant.width) {
        // Still strip EXIF even if not resizing
        const processed = variant.format === 'webp'
          ? await sharp(inputBuffer).rotate().webp({ quality: variant.quality }).toBuffer()
          : await sharp(inputBuffer).rotate().jpeg({ quality: variant.quality }).toBuffer();

        const ext = variant.format === 'webp' ? '.webp' : '.jpg';
        const variantKey = buildVariantKey(objectKey, variant.name, ext);

        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: variantKey,
          Body: processed,
          ContentType: variant.format === 'webp' ? 'image/webp' : 'image/jpeg',
          CacheControl: 'public, max-age=31536000, immutable',
        }));

        variantKeys[variant.name] = variantKey;
      } else {
        const processed = variant.format === 'webp'
          ? await sharp(inputBuffer).rotate().resize(variant.width, null, { withoutEnlargement: true }).webp({ quality: variant.quality }).toBuffer()
          : await sharp(inputBuffer).rotate().resize(variant.width, null, { withoutEnlargement: true }).jpeg({ quality: variant.quality }).toBuffer();

        const ext = variant.format === 'webp' ? '.webp' : '.jpg';
        const variantKey = buildVariantKey(objectKey, variant.name, ext);

        await s3Client.send(new PutObjectCommand({
          Bucket: bucketName,
          Key: variantKey,
          Body: processed,
          ContentType: variant.format === 'webp' ? 'image/webp' : 'image/jpeg',
          CacheControl: 'public, max-age=31536000, immutable',
        }));

        variantKeys[variant.name] = variantKey;
      }
    }

    // 5. Update database with media_meta
    const mediaMeta = {
      width: originalWidth,
      height: originalHeight,
      blurhash: blurhashString,
      variants: variantKeys,
      optimizedAt: new Date().toISOString(),
    };

    await updateDatabase(category, objectKey, mediaMeta, blurhashString);

    log.info('Image optimization complete', {
      objectKey,
      category,
      variants: Object.keys(variantKeys),
      blurhash: blurhashString.substring(0, 10) + '...',
      originalDimensions: `${originalWidth}x${originalHeight}`,
    });
  } catch (error) {
    log.error('Error optimizing image', { objectKey, error });
    // Don't throw — we don't want to retry and reprocess on transient errors
  }
}

/**
 * Update DB with media_meta depending on the S3 key category.
 * - posts/ → update posts.media_meta where media_urls contains the key
 * - peaks/ → update posts.media_meta for peaks (stored in posts table with is_peak=true)
 * - users/ → update profiles.avatar_blurhash or profiles.cover_blurhash
 */
async function updateDatabase(
  category: 'posts' | 'peaks' | 'users',
  objectKey: string,
  mediaMeta: Record<string, unknown>,
  blurhash: string,
): Promise<void> {
  const db = await getPool();

  if (category === 'posts' || category === 'peaks') {
    // Find posts where any media_urls entry ends with this key's path portion
    // Keys look like: posts/{userId}/photo.jpg
    // media_urls contain full CDN URLs: https://cdn.example.com/posts/{userId}/photo.jpg
    // Match by the S3 key suffix
    const result = await db.query(
      `UPDATE posts
       SET media_meta = $1
       WHERE EXISTS (
         SELECT 1 FROM unnest(media_urls) AS url
         WHERE url LIKE '%' || $2
       )
       OR media_url LIKE '%' || $2`,
      [JSON.stringify(mediaMeta), objectKey],
    );

    if (result.rowCount === 0) {
      log.warn('No post found for media key', { objectKey, category });
    } else {
      log.info('Updated post media_meta', { objectKey, rowCount: result.rowCount });
    }
  } else if (category === 'users') {
    // Determine if this is an avatar or cover image based on the key
    const isAvatar = objectKey.includes('/avatar') || objectKey.includes('/profile');
    const isCover = objectKey.includes('/cover') || objectKey.includes('/banner');

    if (isAvatar) {
      const userId = extractUserId(objectKey);
      if (userId) {
        await db.query(
          'UPDATE profiles SET avatar_blurhash = $1 WHERE id = $2',
          [blurhash, userId],
        );
        log.info('Updated avatar blurhash', { userId: userId.substring(0, 8) + '...' });
      }
    } else if (isCover) {
      const userId = extractUserId(objectKey);
      if (userId) {
        await db.query(
          'UPDATE profiles SET cover_blurhash = $1 WHERE id = $2',
          [blurhash, userId],
        );
        log.info('Updated cover blurhash', { userId: userId.substring(0, 8) + '...' });
      }
    }
  }
}
