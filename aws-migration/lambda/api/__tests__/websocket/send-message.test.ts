// Mock AWS SDK module imported by the source file (not used by these utility tests)
jest.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: jest.fn(),
  PostToConnectionCommand: jest.fn(),
}), { virtual: true });

jest.mock('../../../shared/db', () => ({
  getPool: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
    initFromEvent: jest.fn(), setRequestId: jest.fn(), setUserId: jest.fn(),
    child: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('../../utils/error-handler', () => ({
  hasStatusCode: jest.fn(),
}));

jest.mock('../../../shared/moderation/textFilter', () => ({
  filterText: jest.fn().mockReturnValue({ filtered: false }),
}));

jest.mock('../../../shared/moderation/textModeration', () => ({
  analyzeTextToxicity: jest.fn().mockResolvedValue({ toxic: false }),
}));

import { sanitizeMessageContent, stripHtmlTagsLinear, MAX_MESSAGE_LENGTH } from '../../../websocket/send-message';

describe('send-message sanitization', () => {
  it('strips simple tags', () => {
    expect(sanitizeMessageContent('<b>hi</b>')).toBe('hi');
  });

  it('strips nested tags', () => {
    expect(sanitizeMessageContent('a<em>b</em>c')).toBe('abc');
  });

  it('handles malformed tag sequences without hanging', () => {
    expect(sanitizeMessageContent('<<<hello>>>')).toBe('>>');
  });

  it('removes control characters', () => {
    expect(sanitizeMessageContent('hi\x01there')).toBe('hithere');
  });

  it('caps work and output length for very large inputs', () => {
    const huge = '<'.repeat(100000) + 'payload' + '>'.repeat(100000);
    const result = sanitizeMessageContent(huge);
    expect(result.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
  });
});

describe('stripHtmlTagsLinear', () => {
  it('keeps text outside tags', () => {
    expect(stripHtmlTagsLinear('hello <tag>world</tag>')).toBe('hello world');
  });

  it('returns literal text when tag is not closed', () => {
    expect(stripHtmlTagsLinear('start <unfinished text')).toBe('start <unfinished text');
  });
});
