import { Share, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

// App base URL - Update this when you have a real domain
const APP_BASE_URL = 'https://smuppy.app';

export interface ShareContent {
  id: string;
  type: 'post' | 'peak' | 'profile';
  title?: string;
  message?: string;
  authorName?: string;
  authorUsername?: string;
}

/**
 * Generate a shareable link for content
 */
export const generateShareLink = (content: ShareContent): string => {
  switch (content.type) {
    case 'post':
      return `${APP_BASE_URL}/p/${content.id}`;
    case 'peak':
      return `${APP_BASE_URL}/peak/${content.id}`;
    case 'profile':
      return `${APP_BASE_URL}/u/${content.authorUsername || content.id}`;
    default:
      return APP_BASE_URL;
  }
};

/**
 * Generate share message with link
 */
export const generateShareMessage = (content: ShareContent): string => {
  const link = generateShareLink(content);

  switch (content.type) {
    case 'post':
      if (content.message) {
        // Truncate message if too long
        const truncatedMessage = content.message.length > 100
          ? content.message.substring(0, 100) + '...'
          : content.message;
        return `${truncatedMessage}\n\nCheck it out on Smuppy: ${link}`;
      }
      return `Check out this post on Smuppy!\n\n${link}`;

    case 'peak':
      if (content.authorName) {
        return `Watch ${content.authorName}'s Peak on Smuppy!\n\n${link}`;
      }
      return `Watch this Peak on Smuppy!\n\n${link}`;

    case 'profile':
      if (content.authorName) {
        return `Check out ${content.authorName} on Smuppy!\n\n${link}`;
      }
      return `Check out this profile on Smuppy!\n\n${link}`;

    default:
      return `Check this out on Smuppy!\n\n${link}`;
  }
};

/**
 * Share content using native share dialog
 */
export const shareContent = async (content: ShareContent): Promise<boolean> => {
  try {
    const message = generateShareMessage(content);
    const url = generateShareLink(content);

    const result = await Share.share(
      Platform.OS === 'ios'
        ? { message, url }
        : { message: `${message}` } // Android includes URL in message
    );

    if (result.action === Share.sharedAction) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[Share] Error sharing content:', error);
    return false;
  }
};

/**
 * Copy link to clipboard
 */
export const copyLinkToClipboard = async (content: ShareContent): Promise<boolean> => {
  try {
    const link = generateShareLink(content);
    await Clipboard.setStringAsync(link);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (error) {
    console.error('[Share] Error copying link:', error);
    return false;
  }
};

/**
 * Share a post
 */
export const sharePost = async (
  postId: string,
  caption?: string,
  authorName?: string
): Promise<boolean> => {
  return shareContent({
    id: postId,
    type: 'post',
    message: caption,
    authorName,
  });
};

/**
 * Share a peak
 */
export const sharePeak = async (
  peakId: string,
  authorName?: string,
  authorUsername?: string
): Promise<boolean> => {
  return shareContent({
    id: peakId,
    type: 'peak',
    authorName,
    authorUsername,
  });
};

/**
 * Share a profile
 */
export const shareProfile = async (
  userId: string,
  fullName?: string,
  username?: string
): Promise<boolean> => {
  return shareContent({
    id: userId,
    type: 'profile',
    authorName: fullName,
    authorUsername: username,
  });
};

/**
 * Copy post link to clipboard
 */
export const copyPostLink = async (postId: string): Promise<boolean> => {
  return copyLinkToClipboard({
    id: postId,
    type: 'post',
  });
};

/**
 * Copy peak link to clipboard
 */
export const copyPeakLink = async (peakId: string): Promise<boolean> => {
  return copyLinkToClipboard({
    id: peakId,
    type: 'peak',
  });
};

/**
 * Copy profile link to clipboard
 */
export const copyProfileLink = async (
  userId: string,
  username?: string
): Promise<boolean> => {
  return copyLinkToClipboard({
    id: userId,
    type: 'profile',
    authorUsername: username,
  });
};
