import type { AWSAPIService } from '../aws-api';
import type { Result } from '../result';
import { ok, err } from '../result';

declare const __DEV__: boolean;

type UploadUrlResponse = {
  uploadUrl: string;
  fileUrl?: string;
  key?: string;
  publicUrl?: string;
  cdnUrl?: string;
};

export async function getUploadUrl(
  api: AWSAPIService,
  filename: string,
  contentType: string,
  fileSize: number,
  duration?: number
): Promise<Result<UploadUrlResponse>> {
  // Determine uploadType from the folder prefix in filename
  let uploadType = 'post';
  if (filename.startsWith('avatars/')) uploadType = 'avatar';
  else if (filename.startsWith('covers/')) uploadType = 'cover';
  else if (filename.startsWith('peaks/')) uploadType = 'peak';
  else if (filename.startsWith('messages/')) uploadType = 'message';

  if (__DEV__) console.log('[getUploadUrl] uploadType:', uploadType, 'contentType:', contentType);

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return err('UPLOAD_INIT_FAILED', 'Invalid upload file size');
  }

  try {
    const data = await api.request<UploadUrlResponse>('/media/upload-url', {
      method: 'POST',
      body: { filename, contentType, uploadType, fileSize, ...(duration != null && { duration }) },
    });
    return ok(data);
  } catch (_e: unknown) {
    return err('UPLOAD_INIT_FAILED', 'Failed to get upload URL');
  }
}

export async function getUploadQuota(api: AWSAPIService): Promise<Result<{ success: boolean; accountType: string; quotas: Record<string, unknown>; resetsAt: string }>> {
  try {
    const data = await api.request<{ success: boolean; accountType: string; quotas: Record<string, unknown>; resetsAt: string }>('/media/upload-quota');
    return ok(data);
  } catch (_e: unknown) {
    return err('UPLOAD_QUOTA_FAILED', 'Failed to get upload quota');
  }
}
