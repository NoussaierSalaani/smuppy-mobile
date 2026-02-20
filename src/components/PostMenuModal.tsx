import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SPACING } from '../config/theme';
import { useTheme } from '../hooks/useTheme';

/** Report reason options — exported so consumers can reference keys if needed */
export const REPORT_OPTIONS = [
  { key: 'spam', label: 'Spam or misleading' },
  { key: 'inappropriate', label: 'Inappropriate content' },
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'violence', label: 'Violence or dangerous' },
  { key: 'other', label: 'Other' },
] as const;

export type PostMenuModalProps = Readonly<{
  /** Whether the menu modal is visible */
  visible: boolean;
  /** Close the menu modal */
  onClose: () => void;
  /** The selected post (id + authorId are the minimum needed) */
  post: { id: string; authorId: string } | null;
  /** Whether the current user owns this post */
  isOwnPost: boolean;
  /** Delete handler (own posts only) */
  onDelete?: () => void;
  /** Mute handler (other users' posts only) */
  onMute?: () => void;
  /** Block handler (other users' posts only) */
  onBlock?: () => void;
  /** Report handler — receives the reason key */
  onReport: (reason: string) => void;
  /** Share handler (optional — used by PostDetail screens) */
  onShare?: () => void;
  /** Copy link handler (optional — used by PostDetail screens) */
  onCopyLink?: () => void;
  /** View profile handler (optional — used by PostDetail screens) */
  onViewProfile?: () => void;
  /** Whether the user has already reported this post */
  hasReported?: boolean;
  /** Whether the post is already under review */
  isUnderReview?: boolean;
}>;


const PostMenuModal: React.FC<PostMenuModalProps> = ({
  visible,
  onClose,
  post,
  isOwnPost,
  onDelete,
  onMute,
  onBlock,
  onReport,
  onShare,
  onCopyLink,
  onViewProfile,
}) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);

  // Internal state: report modal
  const [showReportModal, setShowReportModal] = useState(false);

  // When the menu closes externally, also reset report modal
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Transition from menu to report modal
  const handleOpenReport = useCallback(() => {
    onClose();
    setShowReportModal(true);
  }, [onClose]);

  // Submit a report with selected reason and close
  const handleSubmitReport = useCallback((reason: string) => {
    setShowReportModal(false);
    onReport(reason);
  }, [onReport]);

  const handleCloseReport = useCallback(() => {
    setShowReportModal(false);
  }, []);

  return (
    <>
      {/* Post Menu Modal */}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={handleClose}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={handleClose}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHandle} />

            {/* Delete (own post) */}
            {post && isOwnPost && onDelete && (
              <TouchableOpacity style={styles.menuItem} onPress={onDelete}>
                <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
                <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Delete Post</Text>
              </TouchableOpacity>
            )}

            {/* Share (optional) */}
            {onShare && (
              <TouchableOpacity style={styles.menuItem} onPress={onShare}>
                <Ionicons name="share-social-outline" size={22} color={colors.dark} />
                <Text style={styles.menuItemText}>Share</Text>
              </TouchableOpacity>
            )}

            {/* Copy Link (optional) */}
            {onCopyLink && (
              <TouchableOpacity style={styles.menuItem} onPress={onCopyLink}>
                <Ionicons name="link-outline" size={22} color={colors.dark} />
                <Text style={styles.menuItemText}>Copy Link</Text>
              </TouchableOpacity>
            )}

            {/* View Profile (optional) */}
            {onViewProfile && (
              <TouchableOpacity style={styles.menuItem} onPress={onViewProfile}>
                <Ionicons name="person-outline" size={22} color={colors.dark} />
                <Text style={styles.menuItemText}>View Profile</Text>
              </TouchableOpacity>
            )}

            {/* Mute & Block (other users' posts) */}
            {post && !isOwnPost && (
              <>
                {onMute && (
                  <TouchableOpacity style={styles.menuItem} onPress={onMute}>
                    <Ionicons name="eye-off-outline" size={22} color={colors.dark} />
                    <Text style={styles.menuItemText}>Mute User</Text>
                  </TouchableOpacity>
                )}
                {onBlock && (
                  <TouchableOpacity style={styles.menuItem} onPress={onBlock}>
                    <Ionicons name="ban-outline" size={22} color="#FF6B6B" />
                    <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Block User</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Report */}
            <TouchableOpacity style={styles.menuItem} onPress={handleOpenReport}>
              <Ionicons name="flag-outline" size={22} color="#FF6B6B" />
              <Text style={[styles.menuItemText, styles.menuItemTextDanger]}>Report</Text>
            </TouchableOpacity>

            {/* Cancel */}
            <TouchableOpacity style={styles.menuCancelButton} onPress={handleClose}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Report Reason Modal */}
      <Modal
        visible={showReportModal}
        transparent
        animationType="slide"
        onRequestClose={handleCloseReport}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={handleCloseReport}
        >
          <View style={styles.menuContainer}>
            <View style={styles.menuHandle} />
            <Text style={styles.reportTitle}>Report this post</Text>
            <Text style={styles.reportSubtitle}>Why are you reporting this?</Text>

            {REPORT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={styles.reportOption}
                onPress={() => handleSubmitReport(option.key)}
              >
                <Text style={styles.reportOptionText}>{option.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.menuCancelButton} onPress={handleCloseReport}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

export default PostMenuModal;

const createStyles = (colors: ReturnType<typeof import('../hooks/useTheme').useTheme>['colors'], isDark: boolean) => StyleSheet.create({
  menuOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  menuContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  menuHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.grayBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 14,
  },
  menuItemText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.dark,
  },
  menuItemTextDanger: {
    color: '#FF6B6B',
  },
  menuCancelButton: {
    marginTop: 8,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    alignItems: 'center',
  },
  menuCancelText: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 16,
    color: colors.dark,
  },
  reportTitle: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 18,
    color: colors.dark,
    textAlign: 'center',
    marginBottom: 4,
  },
  reportSubtitle: {
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: colors.gray,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  reportOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.grayBorder,
  },
  reportOptionText: {
    fontFamily: 'Poppins-Medium',
    fontSize: 16,
    color: colors.dark,
  },
});
