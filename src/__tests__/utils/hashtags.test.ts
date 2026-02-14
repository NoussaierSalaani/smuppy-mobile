/**
 * Hashtag Extraction Tests
 * Tests for extractHashtags() utility
 */

import { extractHashtags } from '../../utils/hashtags';

describe('extractHashtags', () => {
  it('should extract a single hashtag', () => {
    expect(extractHashtags('Hello #world')).toEqual(['world']);
  });

  it('should extract multiple hashtags', () => {
    expect(extractHashtags('#hello #world #test')).toEqual(['hello', 'world', 'test']);
  });

  it('should deduplicate hashtags', () => {
    expect(extractHashtags('#Hello #hello #HELLO')).toEqual(['hello']);
  });

  it('should lowercase all hashtags', () => {
    expect(extractHashtags('#MyTag #UPPER #miXeD')).toEqual(['mytag', 'upper', 'mixed']);
  });

  it('should return empty array for empty string', () => {
    expect(extractHashtags('')).toEqual([]);
  });

  it('should return empty array when no hashtags present', () => {
    expect(extractHashtags('No hashtags here')).toEqual([]);
  });

  it('should handle hashtags adjacent to punctuation', () => {
    expect(extractHashtags('Check #tag! And #other.')).toEqual(['tag', 'other']);
  });

  it('should ignore lone # symbol', () => {
    expect(extractHashtags('Just a # symbol')).toEqual([]);
  });

  it('should support underscores in hashtags', () => {
    expect(extractHashtags('#my_tag #another_one')).toEqual(['my_tag', 'another_one']);
  });

  it('should support numbers in hashtags', () => {
    expect(extractHashtags('#tag123 #2024')).toEqual(['tag123', '2024']);
  });

  it('should handle hashtags at start and end of string', () => {
    expect(extractHashtags('#start middle #end')).toEqual(['start', 'end']);
  });
});
