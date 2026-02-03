/**
 * ProfileScreen Styles
 * Extracted from ProfileScreen.tsx for better maintainability
 * Uses theme colors for dark mode support
 */
import { type ThemeColors } from '../../hooks/useTheme';

import { StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
export const COVER_HEIGHT = 282;
export const AVATAR_SIZE = 96;

export const createProfileStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ===== HEADER =====
  headerContainer: {
    paddingBottom: 4,
  },
  coverAbsolute: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT + 150,
    zIndex: 0,
  },
  coverTouchable: {
    width: '100%',
    height: '100%',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.gray200,
  },
  coverGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  coverSpacer: {
    height: COVER_HEIGHT - 40,
  },
  settingsBtn: {
    position: 'absolute',
    right: 16,
    padding: 8,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 3,
  },
  settingsBtnFixed: {
    position: 'absolute',
    right: 16,
    padding: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 10,
  },

  // ===== AVATAR ROW =====
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 2,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: colors.background,
  },
  avatarEmpty: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: colors.background,
  },
  avatarGradientBorder: {
    width: AVATAR_SIZE + 6,
    height: AVATAR_SIZE + 6,
    borderRadius: (AVATAR_SIZE + 6) / 2,
    padding: 3,
  },
  avatarInnerBorder: {
    width: '100%',
    height: '100%',
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: colors.background,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarWithPeaks: {
    width: AVATAR_SIZE - 8,
    height: AVATAR_SIZE - 8,
    borderRadius: (AVATAR_SIZE - 8) / 2,
  },
  avatarEmptyWithPeaks: {
    width: AVATAR_SIZE - 8,
    height: AVATAR_SIZE - 8,
    borderRadius: (AVATAR_SIZE - 8) / 2,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ===== STATS GLASSMORPHISM =====
  statsGlass: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  statsBlurContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  statGlassItem: {
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  statGlassDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  statGlassValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.dark,
  },
  statGlassLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: colors.gray500,
  },

  // ===== NAME ROW =====
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 4,
    zIndex: 2,
  },
  nameWithBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  displayName: {
    fontFamily: 'WorkSans-SemiBold',
    fontSize: 20,
    color: colors.dark,
    letterSpacing: -0.2,
  },
  badge: {
    marginLeft: 6,
  },
  actionBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ===== BIO =====
  addBioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 20,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.primary,
    gap: 5,
  },
  addBioText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary,
  },
  bioSection: {
    paddingHorizontal: 20,
    marginTop: 2,
    zIndex: 2,
  },
  bioText: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.dark,
    lineHeight: 18,
  },
  bioLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
  },
  seeMoreBtn: {
    alignSelf: 'flex-start',
  },
  seeMoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    paddingVertical: 1,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  locationPin: {
    fontSize: 11,
    marginRight: 3,
  },
  locationText: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.gray400,
  },

  // ===== TABS (LIQUID GLASS STYLE) =====
  tabsContainer: {
    paddingTop: 4,
    paddingBottom: 2,
    backgroundColor: colors.background,
  },
  liquidProfileTabs: {
    marginHorizontal: 16,
  },

  // ===== MORE TABS MODAL =====
  moreTabsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreTabsContainer: {
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    width: SCREEN_WIDTH - 64,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  moreTabsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  moreTabsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 14,
  },
  moreTabsItemActive: {
    backgroundColor: colors.primaryLight,
  },
  moreTabsItemText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray500,
  },
  moreTabsItemTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },

  // ===== EMPTY STATE =====
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.gray900,
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.gray400,
    textAlign: 'center',
    lineHeight: 21,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 24,
    gap: 8,
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },

  // ===== SCROLL CONTENT =====
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    paddingTop: 0,
    paddingBottom: 20,
  },

  // ===== POSTS GRID =====
  postsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  postCardWrapper: {
    width: (SCREEN_WIDTH - 48) / 3,
  },
  postCard: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.gray100,
  },
  postThumb: {
    width: '100%',
    height: '100%',
  },
  postPlayIcon: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postStatsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  postStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  postStatText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },
  listContent: {
    paddingBottom: 20,
  },
  authorName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '400',
    color: colors.gray400,
  },
  likes: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.gray400,
    marginLeft: 2,
  },

  // ===== PEAKS GRID =====
  peaksGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 8,
  },
  peakCard: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
  peakThumb: {
    width: '100%',
    height: '100%',
  },
  peakDuration: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  peakDurationText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  peakStatsOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 6,
  },
  peakStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  peakStatText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },

  // ===== COLLECTIONS GRID =====
  collectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  collectionCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: colors.background,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  collectionThumb: {
    width: '100%',
    height: 120,
  },
  collectionPlayIcon: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectionSaveIcon: {
    position: 'absolute',
    top: 8,
    right: 36,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(14, 191, 138, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectionMenu: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  collectionInfo: {
    padding: 10,
  },
  collectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray900,
    lineHeight: 18,
    marginBottom: 8,
  },
  collectionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectionAuthorName: {
    flex: 1,
    fontSize: 11,
    fontWeight: '400',
    color: colors.gray400,
  },
  collectionLikes: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.gray400,
    marginLeft: 2,
  },

  // ===== QR MODAL =====
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrModalContent: {
    alignItems: 'center',
    padding: 30,
  },
  qrCloseBtn: {
    position: 'absolute',
    top: -60,
    right: 0,
    padding: 10,
  },
  qrContainer: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  qrCode: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrUsername: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  qrHint: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 24,
  },
  profileLinkContainer: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    maxWidth: 280,
  },
  profileLinkText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
  qrCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  qrCopyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ===== FAN BUTTON =====
  fanButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: 'center',
  },
  fanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },

  // ===== COLLECTION MENU MODAL =====
  collectionMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  collectionMenuContainer: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 34,
  },
  collectionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray100,
  },
  collectionMenuItemLast: {
    borderBottomWidth: 0,
  },
  collectionMenuText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.gray900,
    marginLeft: 16,
  },

  // ===== LIVES GRID =====
  livesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  liveCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: colors.background,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  liveThumb: {
    width: '100%',
    height: 100,
  },
  livePlayOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  livePlayBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveDuration: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  liveDurationText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },
  liveMembersBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0EBF8A',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  liveMembersText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FFF',
  },
  liveInfo: {
    padding: 10,
  },
  liveTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray900,
    lineHeight: 18,
    marginBottom: 6,
  },
  liveMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveMetaText: {
    fontSize: 11,
    color: colors.gray400,
  },
  liveDate: {
    fontSize: 11,
    color: colors.gray400,
  },
  scheduleLiveBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  scheduleLiveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  scheduleLiveBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },

  // ===== VIDEOS GRID =====
  videosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  videoCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: colors.background,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  videoThumbnail: {
    width: '100%',
    height: 100,
  },
  videoDurationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 3,
  },
  videoDurationText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },
  videoInfo: {
    padding: 10,
  },
  videoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray900,
    lineHeight: 18,
    marginBottom: 6,
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  videoVisibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
  },
  videoVisibilityText: {
    fontSize: 10,
    fontWeight: '600',
  },
  videoViews: {
    fontSize: 10,
    color: colors.gray400,
  },
  uploadVideoBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  uploadVideoBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  uploadVideoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },

  // ===== SESSIONS =====
  sessionsContainer: {
    paddingHorizontal: 16,
  },
  sessionsSection: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray900,
    marginBottom: 12,
    marginTop: 8,
  },
  sessionCard: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  sessionDateBox: {
    width: 60,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  sessionDayName: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gray400,
    textTransform: 'uppercase',
  },
  sessionDayNum: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.gray900,
    marginVertical: 2,
  },
  sessionMonth: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.gray400,
    textTransform: 'uppercase',
  },
  sessionInfo: {
    flex: 1,
    padding: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionDetails: {
    flex: 1,
    marginLeft: 10,
  },
  sessionClientName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray900,
  },
  sessionTime: {
    fontSize: 12,
    color: colors.gray400,
    marginTop: 2,
  },
  sessionStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sessionStatusUpcoming: {
    backgroundColor: 'rgba(14, 191, 138, 0.15)',
  },
  sessionStatusCompleted: {
    backgroundColor: colors.gray100,
  },
  sessionStatusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sessionStatusTextUpcoming: {
    color: '#0EBF8A',
  },
  sessionStatusTextCompleted: {
    color: colors.gray400,
  },
  sessionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  sessionPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.gray900,
  },
  sessionJoinBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 8,
  },
  sessionJoinText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },

  // ===== INLINE STYLE EXTRACTIONS =====
  postThumbEmpty: {
    backgroundColor: colors.gray100,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  emptyIconMargin: {
    marginBottom: 16,
  },
  loadingCenter: {
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  loadingMargin: {
    marginTop: 12,
  },
  bottomSpacer: {
    height: 120,
  },

  // ===== GROUP/EVENT TAB =====
  groupEventContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  groupEventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  toggleChipsRow: {
    flexDirection: 'row',
    backgroundColor: colors.gray100,
    borderRadius: 10,
    padding: 3,
  },
  toggleChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleChipActive: {
    backgroundColor: colors.background,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.gray400,
  },
  toggleChipTextActive: {
    color: colors.dark,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  newButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  groupEventList: {
    gap: 0,
  },
});
