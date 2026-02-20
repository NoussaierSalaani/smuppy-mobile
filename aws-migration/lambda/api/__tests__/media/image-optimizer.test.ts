/**
 * Tests for media/image-optimizer Lambda handler (EventBridge trigger)
 */

jest.mock('../../../shared/db', () => ({ getPool: jest.fn(), getReaderPool: jest.fn() }));
jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), child: jest.fn().mockReturnThis(),
  })),
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({ send: jest.fn().mockResolvedValue({
    Body: { transformToByteArray: jest.fn().mockResolvedValue(Buffer.from('fake-image')) },
  }) })),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
}));
jest.mock('sharp', () => {
  const mockSharp = jest.fn().mockReturnValue({
    metadata: jest.fn().mockResolvedValue({ width: 1920, height: 1080 }),
    resize: jest.fn().mockReturnThis(),
    rotate: jest.fn().mockReturnThis(),
    webp: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    ensureAlpha: jest.fn().mockReturnThis(),
    raw: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue({ data: Buffer.alloc(32 * 32 * 4), info: { width: 32, height: 32 } }),
  });
  return mockSharp;
});
jest.mock('blurhash', () => ({
  encode: jest.fn().mockReturnValue('LKO2?U%2Tw=w]~RBVZRi}Y-;M{R*'),
}));

import { getPool } from '../../../shared/db';
import { handler } from '../../media/image-optimizer';

describe('media/image-optimizer handler', () => {
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { query: jest.fn().mockResolvedValue({ rows: [], rowCount: 1 }) };
    (getPool as jest.Mock).mockResolvedValue(mockDb);
  });

  it('should skip non-image files', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/video.mp4', size: 1000 } },
    });
    // No DB calls expected for non-image files
    expect(getPool).not.toHaveBeenCalled();
  });

  it('should skip variant keys (prevent recursion)', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/large/photo.jpg', size: 1000 } },
    });
    expect(getPool).not.toHaveBeenCalled();
  });

  it('should skip unrecognized prefixes', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'unknown/user1/photo.jpg', size: 1000 } },
    });
    expect(getPool).not.toHaveBeenCalled();
  });

  it('should skip oversized images', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/photo.jpg', size: 30 * 1024 * 1024 } },
    });
    expect(getPool).not.toHaveBeenCalled();
  });

  it('should process posts/ images and update DB', async () => {
    await handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/photo.jpg', size: 1000 } },
    });
    expect(getPool).toHaveBeenCalled();
    expect(mockDb.query).toHaveBeenCalled();
  });

  it('should not throw on processing error', async () => {
    // S3 GetObject will throw
    const { S3Client } = require('@aws-sdk/client-s3');
    S3Client.mockImplementationOnce(() => ({
      send: jest.fn().mockRejectedValue(new Error('S3 error')),
    }));

    // Should not throw
    await expect(handler({
      detail: { bucket: { name: 'test-bucket' }, object: { key: 'posts/user1/photo.jpg', size: 1000 } },
    })).resolves.toBeUndefined();
  });
});
