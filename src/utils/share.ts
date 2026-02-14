import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

const APP_BASE_URL = 'https://smuppy.app';

interface CopyLinkContent {
  id: string;
  type: 'post' | 'peak' | 'profile';
  authorUsername?: string;
}

const generateLink = (content: CopyLinkContent): string => {
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

const copyLinkToClipboard = async (content: CopyLinkContent): Promise<boolean> => {
  try {
    const link = generateLink(content);
    await Clipboard.setStringAsync(link);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    return true;
  } catch (error) {
    if (__DEV__) console.warn('[Share] Error copying link:', error);
    return false;
  }
};

/**
 * Copy post link to clipboard
 */
export const copyPostLink = async (postId: string): Promise<boolean> => {
  return copyLinkToClipboard({ id: postId, type: 'post' });
};

/**
 * Copy peak link to clipboard
 */
export const copyPeakLink = async (peakId: string): Promise<boolean> => {
  return copyLinkToClipboard({ id: peakId, type: 'peak' });
};

/**
 * Copy profile link to clipboard
 */
export const copyProfileLink = async (userId: string, username?: string): Promise<boolean> => {
  return copyLinkToClipboard({ id: userId, type: 'profile', authorUsername: username });
};
