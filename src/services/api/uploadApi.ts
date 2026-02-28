import type { AWSAPIService } from '../aws-api';
import { APIError } from './error';

declare const __DEV__: boolean;

export async function getUploadUrl(
  api: AWSAPIService,
  filename: string,
  contentType: string,
  fileSize: number,
  duration?: number
): Promise<{
  uploadUrl: string;
  fileUrl?: string;
  key?: string;
  publicUrl?: string;
  cdnUrl?: string;
}> {
  // Determine uploadType from the folder prefix in filename
  let uploadType = 'post';
  if (filename.startsWith('avatars/')) uploadType = 'avatar';
  else if (filename.startsWith('covers/')) uploadType = 'cover';
  else if (filename.startsWith('peaks/')) uploadType = 'peak';
  else if (filename.startsWith('messages/')) uploadType = 'message';

  if (__DEV__) console.log('[getUploadUrl] uploadType:', uploadType, 'contentType:', contentType);

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new APIError('Invalid upload file size', 400);
  }

  return api.request('/media/upload-url', {
    method: 'POST',
    body: { filename, contentType, uploadType, fileSize, ...(duration != null && { duration }) },
  });
}

export async function getUploadQuota(api: AWSAPIService): Promise<{ success: boolean; accountType: string; quotas: Record<string, unknown>; resetsAt: string }> {
  return api.request('/media/upload-quota');
}
