/**
 * Tests for utils/mappers — mapAuthor, mapRequester, mapCreator
 */

import { mapAuthor, mapRequester, mapCreator } from '../../utils/mappers';

describe('mapAuthor', () => {
  it('should map standard author fields', () => {
    const row = {
      author_id: 'id-1',
      author_username: 'alice',
      author_full_name: 'Alice Smith',
      author_avatar_url: 'https://cdn.example.com/a.jpg',
      author_is_verified: true,
      author_account_type: 'pro_creator',
      author_business_name: null,
    };
    const result = mapAuthor(row);
    expect(result).toEqual({
      id: 'id-1',
      username: 'alice',
      fullName: 'Alice Smith',
      avatarUrl: 'https://cdn.example.com/a.jpg',
      isVerified: true,
      accountType: 'pro_creator',
      businessName: null,
    });
  });

  it('should default isVerified to false when falsy', () => {
    const row = {
      author_id: 'id-1',
      author_username: 'bob',
      author_full_name: 'Bob',
      author_avatar_url: null,
      author_is_verified: undefined,
      author_account_type: undefined,
      author_business_name: undefined,
    };
    const result = mapAuthor(row);
    expect(result.isVerified).toBe(false);
    expect(result.accountType).toBe('personal');
    expect(result.businessName).toBeNull();
    expect(result.avatarUrl).toBeNull();
  });

  it('should handle missing fields gracefully', () => {
    const row = {} as Record<string, unknown>;
    const result = mapAuthor(row);
    expect(result.id).toBeUndefined();
    expect(result.isVerified).toBe(false);
    expect(result.accountType).toBe('personal');
  });

  it('should handle business account type', () => {
    const row = {
      author_id: 'id-1',
      author_username: 'shop',
      author_full_name: 'Shop Inc',
      author_avatar_url: 'https://cdn.example.com/shop.jpg',
      author_is_verified: true,
      author_account_type: 'pro_business',
      author_business_name: 'Shop Inc',
    };
    const result = mapAuthor(row);
    expect(result.accountType).toBe('pro_business');
    expect(result.businessName).toBe('Shop Inc');
  });
});

describe('mapRequester', () => {
  it('should map standard requester fields including bio', () => {
    const row = {
      requester_id: 'id-2',
      requester_username: 'carol',
      requester_full_name: 'Carol',
      requester_avatar_url: 'https://cdn.example.com/c.jpg',
      requester_bio: 'Hello world',
      requester_is_verified: false,
      requester_account_type: 'personal',
      requester_business_name: null,
    };
    const result = mapRequester(row);
    expect(result).toEqual({
      id: 'id-2',
      username: 'carol',
      fullName: 'Carol',
      avatarUrl: 'https://cdn.example.com/c.jpg',
      bio: 'Hello world',
      isVerified: false,
      accountType: 'personal',
      businessName: null,
    });
  });

  it('should default bio to null when missing', () => {
    const row = {
      requester_id: 'id-2',
      requester_username: 'dave',
      requester_full_name: 'Dave',
      requester_avatar_url: null,
      requester_bio: undefined,
      requester_is_verified: false,
      requester_account_type: 'personal',
      requester_business_name: null,
    };
    const result = mapRequester(row);
    expect(result.bio).toBeNull();
  });
});

describe('mapCreator', () => {
  it('should map standard creator fields including displayName', () => {
    const row = {
      creator_id: 'id-3',
      creator_username: 'eve',
      creator_full_name: 'Eve',
      creator_display_name: 'Eve the Creator',
      creator_avatar_url: 'https://cdn.example.com/e.jpg',
      creator_is_verified: true,
      creator_account_type: 'pro_creator',
      creator_business_name: null,
    };
    const result = mapCreator(row);
    expect(result).toEqual({
      id: 'id-3',
      username: 'eve',
      fullName: 'Eve',
      displayName: 'Eve the Creator',
      avatarUrl: 'https://cdn.example.com/e.jpg',
      isVerified: true,
      accountType: 'pro_creator',
      businessName: null,
    });
  });

  it('should default displayName to null when missing', () => {
    const row = {
      creator_id: 'id-3',
      creator_username: 'frank',
      creator_full_name: 'Frank',
      creator_display_name: undefined,
      creator_avatar_url: null,
      creator_is_verified: false,
      creator_account_type: 'personal',
      creator_business_name: null,
    };
    const result = mapCreator(row);
    expect(result.displayName).toBeNull();
  });

  it('should handle missing fields gracefully', () => {
    const result = mapCreator({});
    expect(result.isVerified).toBe(false);
    expect(result.accountType).toBe('personal');
    expect(result.displayName).toBeNull();
  });
});
