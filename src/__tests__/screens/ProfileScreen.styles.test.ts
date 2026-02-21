/**
 * ProfileScreen.styles Tests
 *
 * Tests for the createProfileStyles factory function, COVER_HEIGHT
 * and AVATAR_SIZE constants. Verifies all style keys are present,
 * theme colors are applied, and isDark flag toggles dark-specific values.
 */

// ---------------------------------------------------------------------------
// Mocks — declared before imports so they are hoisted by Jest
// ---------------------------------------------------------------------------

jest.mock('react-native', () => ({
  StyleSheet: { create: <T,>(s: T): T => s },
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
  },
}));

jest.mock('../../utils/responsive', () => ({
  WIDTH_CAPPED: 390,
  SCREEN_WIDTH: 390,
  SCREEN_HEIGHT: 844,
  HEIGHT_CAPPED: 844,
  normalize: (size: number) => size,
  wp: (pct: number) => (pct * 390) / 100,
  sp: (pct: number) => (pct * 390) / 100,
  hp: (pct: number) => (pct * 844) / 100,
}));

jest.mock('../../hooks/useTheme', () => ({}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import {
  createProfileStyles,
  COVER_HEIGHT,
  AVATAR_SIZE,
} from '../../screens/profile/ProfileScreen.styles';

// ---------------------------------------------------------------------------
// Mock theme colors
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock of ThemeColors (59 props)
const mockLightColors: any = {
  primary: '#0EBF8A',
  primaryDark: '#0066ac',
  primaryLight: '#E6FAF8',
  dark: '#0a252f',
  background: '#FFFFFF',
  backgroundSecondary: '#F9FAFB',
  white: '#FFFFFF',
  error: '#FF3B30',
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray400: '#9CA3AF',
  gray500: '#6B7280',
  gray600: '#4B5563',
  gray700: '#374151',
  gray800: '#1F2937',
  gray900: '#111827',
  grayMuted: '#9cadbc',
  text: '#0a252f',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- partial mock of ThemeColors (59 props)
const mockDarkColors: any = {
  primary: '#0EBF8A',
  primaryDark: '#0066ac',
  primaryLight: '#1A3D33',
  dark: '#E5E7EB',
  background: '#0D0D0D',
  backgroundSecondary: '#1A1A1A',
  white: '#FFFFFF',
  error: '#FF3B30',
  gray50: '#1F2937',
  gray100: '#374151',
  gray200: '#4B5563',
  gray300: '#6B7280',
  gray400: '#9CA3AF',
  gray500: '#D1D5DB',
  gray600: '#E5E7EB',
  gray700: '#F3F4F6',
  gray800: '#F9FAFB',
  gray900: '#F9FAFB',
  grayMuted: '#9cadbc',
  text: '#E5E7EB',
};

// ---------------------------------------------------------------------------
// All expected style keys from the source file, grouped by section
// ---------------------------------------------------------------------------

const HEADER_KEYS = [
  'headerContainer',
  'coverAbsolute',
  'coverTouchable',
  'coverImage',
  'coverPlaceholder',
  'coverGradientOverlay',
  'coverSpacer',
  'settingsBtn',
  'settingsBtnFixed',
];

const AVATAR_KEYS = [
  'avatarRow',
  'avatar',
  'avatarEmpty',
  'avatarGradientBorder',
  'avatarInnerBorder',
  'avatarWithPeaks',
  'avatarEmptyWithPeaks',
];

const STATS_GLASS_KEYS = [
  'statsGlass',
  'statsBlurContainer',
  'statGlassItem',
  'statGlassDivider',
  'statGlassValue',
  'statGlassLabel',
];

const NAME_ROW_KEYS = [
  'nameRow',
  'nameWithBadges',
  'displayName',
  'badge',
  'actionBtns',
  'actionBtn',
];

const BIO_KEYS = [
  'addBioBtn',
  'addBioText',
  'bioSection',
  'bioText',
  'bioLink',
  'seeMoreBtn',
  'seeMoreText',
  'locationRow',
  'locationPin',
  'locationText',
];

const TABS_KEYS = [
  'tabsContainer',
  'liquidProfileTabs',
];

const MORE_TABS_KEYS = [
  'moreTabsOverlay',
  'moreTabsContainer',
  'moreTabsTitle',
  'moreTabsItem',
  'moreTabsItemActive',
  'moreTabsItemText',
  'moreTabsItemTextActive',
];

const EMPTY_STATE_KEYS = [
  'emptyContainer',
  'emptyTitle',
  'emptyDesc',
  'createBtn',
  'createBtnText',
];

const SCROLL_KEYS = [
  'scrollContent',
  'scrollContentContainer',
];

const POSTS_GRID_KEYS = [
  'postsGrid',
  'postCardWrapper',
  'masonryContainer',
  'masonryColumn',
  'masonryCard',
  'postCard',
  'postThumb',
  'postPlayIcon',
  'postStatsOverlay',
  'postStat',
  'postStatText',
  'listContent',
  'authorName',
  'likes',
];

const PEAKS_KEYS = [
  'peaksGrid',
  'peakCard',
  'peakThumb',
  'peakDuration',
  'peakDurationText',
  'peakStatsOverlay',
  'peakStat',
  'peakStatText',
];

const PEAK_GROUP_KEYS = [
  'peakGroupsGrid',
  'peakGroupCard',
  'peakGroupThumb',
  'peakGroupCountBadge',
  'peakGroupCountText',
  'peakGroupOverlay',
  'peakGroupLabel',
  'peakGroupStats',
  'peakGroupStatText',
];

const COLLECTIONS_KEYS = [
  'collectionsGrid',
  'collectionCard',
  'collectionThumb',
  'collectionPlayIcon',
  'collectionSaveIcon',
  'collectionMenu',
  'collectionInfo',
  'collectionTitle',
  'collectionMeta',
  'collectionAuthorName',
  'collectionLikes',
];

const QR_MODAL_KEYS = [
  'qrModalOverlay',
  'qrModalContent',
  'qrCloseBtn',
  'qrContainer',
  'qrCode',
  'qrUsername',
  'qrHint',
  'profileLinkContainer',
  'profileLinkText',
  'qrCopyBtn',
  'qrCopyText',
];

const FAN_BUTTON_KEYS = [
  'fanButton',
  'fanButtonText',
];

const COLLECTION_MENU_KEYS = [
  'collectionMenuOverlay',
  'collectionMenuContainer',
  'collectionMenuItem',
  'collectionMenuItemLast',
  'collectionMenuText',
  'collectionMenuTextCancel',
];

const LIVES_KEYS = [
  'livesGrid',
  'liveCard',
  'liveThumb',
  'livePlayOverlay',
  'livePlayBtn',
  'liveDuration',
  'liveDurationText',
  'liveMembersBadge',
  'liveMembersText',
  'liveInfo',
  'liveTitle',
  'liveMeta',
  'liveMetaItem',
  'liveMetaText',
  'liveDate',
  'scheduleLiveBtn',
  'scheduleLiveBtnGradient',
  'scheduleLiveBtnText',
];

const VIDEOS_KEYS = [
  'videosGrid',
  'videoCard',
  'videoThumbnail',
  'videoDurationBadge',
  'videoDurationText',
  'videoInfo',
  'videoTitle',
  'videoMeta',
  'videoVisibilityBadge',
  'videoVisibilityText',
  'videoViews',
  'uploadVideoBtn',
  'uploadVideoBtnGradient',
  'uploadVideoBtnText',
];

const SESSION_KEYS = [
  'sessionsContainer',
  'sessionsSection',
  'sessionCard',
  'sessionDateBox',
  'sessionDayName',
  'sessionDayNum',
  'sessionMonth',
  'sessionInfo',
  'sessionHeader',
  'sessionDetails',
  'sessionClientName',
  'sessionTime',
  'sessionStatusBadge',
  'sessionStatusUpcoming',
  'sessionStatusCompleted',
  'sessionStatusText',
  'sessionStatusTextUpcoming',
  'sessionStatusTextCompleted',
  'sessionFooter',
  'sessionPrice',
  'sessionJoinBtn',
  'sessionJoinText',
];

const INLINE_EXTRACTION_KEYS = [
  'postThumbEmpty',
  'emptyIconMargin',
  'loadingCenter',
  'loadingMargin',
  'bottomSpacer',
];

const GROUP_EVENT_KEYS = [
  'groupEventContainer',
  'groupEventHeader',
  'newButton',
  'newButtonText',
  'groupEventList',
];

const PLANNING_KEYS = [
  'planningContainer',
  'planningEditBtn',
  'planningEditBtnText',
  'planningDayHeader',
  'planningSlotCard',
  'planningSlotDot',
  'planningSlotInfo',
  'planningSlotName',
  'planningSlotTime',
];

const MISC_KEYS = [
  'loadMoreBtn',
  'loadMoreBtnText',
  'container',
];

const ALL_STYLE_KEYS = [
  ...MISC_KEYS,
  ...HEADER_KEYS,
  ...AVATAR_KEYS,
  ...STATS_GLASS_KEYS,
  ...NAME_ROW_KEYS,
  ...BIO_KEYS,
  ...TABS_KEYS,
  ...MORE_TABS_KEYS,
  ...EMPTY_STATE_KEYS,
  ...SCROLL_KEYS,
  ...POSTS_GRID_KEYS,
  ...PEAKS_KEYS,
  ...PEAK_GROUP_KEYS,
  ...COLLECTIONS_KEYS,
  ...QR_MODAL_KEYS,
  ...FAN_BUTTON_KEYS,
  ...COLLECTION_MENU_KEYS,
  ...LIVES_KEYS,
  ...VIDEOS_KEYS,
  ...SESSION_KEYS,
  ...INLINE_EXTRACTION_KEYS,
  ...GROUP_EVENT_KEYS,
  ...PLANNING_KEYS,
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileScreen.styles', () => {
  // ===== Constants =====

  describe('COVER_HEIGHT constant', () => {
    it('should equal 282', () => {
      expect(COVER_HEIGHT).toBe(282);
    });

    it('should be a number', () => {
      expect(typeof COVER_HEIGHT).toBe('number');
    });
  });

  describe('AVATAR_SIZE constant', () => {
    it('should equal 96', () => {
      expect(AVATAR_SIZE).toBe(96);
    });

    it('should be a number', () => {
      expect(typeof AVATAR_SIZE).toBe('number');
    });
  });

  // ===== Factory function: basic contract =====

  describe('createProfileStyles', () => {
    it('should return an object', () => {
      const styles = createProfileStyles(mockLightColors);
      expect(typeof styles).toBe('object');
      expect(styles).not.toBeNull();
    });

    it('should contain all expected style keys', () => {
      const styles = createProfileStyles(mockLightColors);
      const styleKeys = Object.keys(styles);

      ALL_STYLE_KEYS.forEach((key) => {
        expect(styleKeys).toContain(key);
      });
    });

    it('should not contain unexpected keys beyond the defined style keys', () => {
      const styles = createProfileStyles(mockLightColors);
      const styleKeys = Object.keys(styles);

      styleKeys.forEach((key) => {
        expect(ALL_STYLE_KEYS).toContain(key);
      });
    });

    it('should have the correct total number of style keys', () => {
      const styles = createProfileStyles(mockLightColors);
      expect(Object.keys(styles).length).toBe(ALL_STYLE_KEYS.length);
    });
  });

  // ===== Section-level key presence =====

  describe('style sections', () => {
    let styles: ReturnType<typeof createProfileStyles>;

    beforeAll(() => {
      styles = createProfileStyles(mockLightColors);
    });

    it('should have all header keys', () => {
      HEADER_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all avatar keys', () => {
      AVATAR_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all stats glassmorphism keys', () => {
      STATS_GLASS_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all name row keys', () => {
      NAME_ROW_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all bio keys', () => {
      BIO_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all tabs keys', () => {
      TABS_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all more tabs modal keys', () => {
      MORE_TABS_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all empty state keys', () => {
      EMPTY_STATE_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all scroll content keys', () => {
      SCROLL_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all posts grid keys', () => {
      POSTS_GRID_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all peaks keys', () => {
      PEAKS_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all peak group keys', () => {
      PEAK_GROUP_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all collections keys', () => {
      COLLECTIONS_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all QR modal keys', () => {
      QR_MODAL_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all fan button keys', () => {
      FAN_BUTTON_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all collection menu keys', () => {
      COLLECTION_MENU_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all lives keys', () => {
      LIVES_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all videos keys', () => {
      VIDEOS_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all session keys', () => {
      SESSION_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all inline extraction keys', () => {
      INLINE_EXTRACTION_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all group/event tab keys', () => {
      GROUP_EVENT_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });

    it('should have all planning tab keys', () => {
      PLANNING_KEYS.forEach((key) => {
        expect(styles).toHaveProperty(key);
      });
    });
  });

  // ===== Theme color application =====

  describe('theme color application (light)', () => {
    let styles: ReturnType<typeof createProfileStyles>;

    beforeAll(() => {
      styles = createProfileStyles(mockLightColors);
    });

    it('should apply primary color to loadMoreBtnText', () => {
      expect(styles.loadMoreBtnText.color).toBe(mockLightColors.primary);
    });

    it('should apply background color to container', () => {
      expect(styles.container.backgroundColor).toBe(mockLightColors.background);
    });

    it('should apply gray200 to coverPlaceholder background', () => {
      expect(styles.coverPlaceholder.backgroundColor).toBe(mockLightColors.gray200);
    });

    it('should apply background color to avatar borderColor', () => {
      expect(styles.avatar.borderColor).toBe(mockLightColors.background);
    });

    it('should apply gray100 to avatarEmpty background', () => {
      expect(styles.avatarEmpty.backgroundColor).toBe(mockLightColors.gray100);
    });

    it('should apply dark color to displayName', () => {
      expect(styles.displayName.color).toBe(mockLightColors.dark);
    });

    it('should apply primary color to bioLink', () => {
      expect(styles.bioLink.color).toBe(mockLightColors.primary);
    });

    it('should apply background to tabsContainer', () => {
      expect(styles.tabsContainer.backgroundColor).toBe(mockLightColors.background);
    });

    it('should apply gray900 to emptyTitle color', () => {
      expect(styles.emptyTitle.color).toBe(mockLightColors.gray900);
    });

    it('should apply primary to createBtn background', () => {
      expect(styles.createBtn.backgroundColor).toBe(mockLightColors.primary);
    });

    it('should apply white to createBtnText color', () => {
      expect(styles.createBtnText.color).toBe(mockLightColors.white);
    });

    it('should apply primary to fanButton background', () => {
      expect(styles.fanButton.backgroundColor).toBe(mockLightColors.primary);
    });

    it('should apply white to fanButtonText color', () => {
      expect(styles.fanButtonText.color).toBe(mockLightColors.white);
    });

    it('should apply background to moreTabsContainer', () => {
      expect(styles.moreTabsContainer.backgroundColor).toBe(mockLightColors.background);
    });

    it('should apply primaryLight to moreTabsItemActive background', () => {
      expect(styles.moreTabsItemActive.backgroundColor).toBe(mockLightColors.primaryLight);
    });

    it('should apply primary to addBioBtn borderColor', () => {
      expect(styles.addBioBtn.borderColor).toBe(mockLightColors.primary);
    });

    it('should apply gray400 to locationText color', () => {
      expect(styles.locationText.color).toBe(mockLightColors.gray400);
    });

    it('should apply gray900 to collectionTitle color', () => {
      expect(styles.collectionTitle.color).toBe(mockLightColors.gray900);
    });

    it('should apply background to collectionCard background', () => {
      expect(styles.collectionCard.backgroundColor).toBe(mockLightColors.background);
    });

    it('should apply white to qrContainer background', () => {
      expect(styles.qrContainer.backgroundColor).toBe(mockLightColors.white);
    });

    it('should apply background to collectionMenuContainer', () => {
      expect(styles.collectionMenuContainer.backgroundColor).toBe(mockLightColors.background);
    });

    it('should apply grayMuted to collectionMenuTextCancel', () => {
      expect(styles.collectionMenuTextCancel.color).toBe(mockLightColors.grayMuted);
    });

    it('should apply primary to sessionJoinBtn background', () => {
      expect(styles.sessionJoinBtn.backgroundColor).toBe(mockLightColors.primary);
    });

    it('should apply gray100 to sessionDateBox background', () => {
      expect(styles.sessionDateBox.backgroundColor).toBe(mockLightColors.gray100);
    });

    it('should apply primary to planningEditBtn background', () => {
      expect(styles.planningEditBtn.backgroundColor).toBe(mockLightColors.primary);
    });

    it('should apply white to planningEditBtnText color', () => {
      expect(styles.planningEditBtnText.color).toBe(mockLightColors.white);
    });

    it('should apply primary to newButtonText color', () => {
      expect(styles.newButtonText.color).toBe(mockLightColors.primary);
    });

    it('should apply gray100 to actionBtn background', () => {
      expect(styles.actionBtn.backgroundColor).toBe(mockLightColors.gray100);
    });
  });

  describe('theme color application (dark)', () => {
    let styles: ReturnType<typeof createProfileStyles>;

    beforeAll(() => {
      styles = createProfileStyles(mockDarkColors);
    });

    it('should apply dark background color to container', () => {
      expect(styles.container.backgroundColor).toBe(mockDarkColors.background);
    });

    it('should apply dark theme dark color to displayName', () => {
      expect(styles.displayName.color).toBe(mockDarkColors.dark);
    });

    it('should apply dark background to avatar borderColor', () => {
      expect(styles.avatar.borderColor).toBe(mockDarkColors.background);
    });

    it('should apply dark theme gray100 to avatarEmpty background', () => {
      expect(styles.avatarEmpty.backgroundColor).toBe(mockDarkColors.gray100);
    });

    it('should apply dark background to tabsContainer', () => {
      expect(styles.tabsContainer.backgroundColor).toBe(mockDarkColors.background);
    });

    it('should apply dark gray900 to emptyTitle color', () => {
      expect(styles.emptyTitle.color).toBe(mockDarkColors.gray900);
    });
  });

  // ===== isDark flag behavior =====

  describe('isDark flag', () => {
    it('should default isDark to false when not provided', () => {
      const styles = createProfileStyles(mockLightColors);
      expect(styles.statsGlass.borderColor).toBe('rgba(14, 191, 138, 0.4)');
    });

    it('should apply light mode colors when isDark is false', () => {
      const styles = createProfileStyles(mockLightColors, false);

      expect(styles.statsGlass.borderColor).toBe('rgba(14, 191, 138, 0.4)');
      expect(styles.statsBlurContainer.backgroundColor).toBe('rgba(255,255,255,0.4)');
      expect(styles.statGlassDivider.backgroundColor).toBe('rgba(14, 191, 138, 0.35)');
      expect(styles.masonryCard.borderColor).toBe('rgba(14, 191, 138, 0.25)');
    });

    it('should apply dark mode colors when isDark is true', () => {
      const styles = createProfileStyles(mockDarkColors, true);

      expect(styles.statsGlass.borderColor).toBe('rgba(14, 191, 138, 0.5)');
      expect(styles.statsBlurContainer.backgroundColor).toBe('rgba(26,26,26,0.8)');
      expect(styles.statGlassDivider.backgroundColor).toBe('rgba(14, 191, 138, 0.4)');
      expect(styles.masonryCard.borderColor).toBe('rgba(14, 191, 138, 0.35)');
    });
  });

  // ===== Constant-dependent computations =====

  describe('COVER_HEIGHT-dependent styles', () => {
    let styles: ReturnType<typeof createProfileStyles>;

    beforeAll(() => {
      styles = createProfileStyles(mockLightColors);
    });

    it('should use COVER_HEIGHT + 150 for coverAbsolute height', () => {
      expect(styles.coverAbsolute.height).toBe(COVER_HEIGHT + 150);
    });

    it('should use COVER_HEIGHT - 60 for coverSpacer height', () => {
      expect(styles.coverSpacer.height).toBe(COVER_HEIGHT - 60);
    });
  });

  describe('AVATAR_SIZE-dependent styles', () => {
    let styles: ReturnType<typeof createProfileStyles>;

    beforeAll(() => {
      styles = createProfileStyles(mockLightColors);
    });

    it('should use AVATAR_SIZE for avatar width and height', () => {
      expect(styles.avatar.width).toBe(AVATAR_SIZE);
      expect(styles.avatar.height).toBe(AVATAR_SIZE);
    });

    it('should use AVATAR_SIZE / 2 for avatar borderRadius', () => {
      expect(styles.avatar.borderRadius).toBe(AVATAR_SIZE / 2);
    });

    it('should use AVATAR_SIZE for avatarEmpty width and height', () => {
      expect(styles.avatarEmpty.width).toBe(AVATAR_SIZE);
      expect(styles.avatarEmpty.height).toBe(AVATAR_SIZE);
    });

    it('should use AVATAR_SIZE + 6 for avatarGradientBorder dimensions', () => {
      expect(styles.avatarGradientBorder.width).toBe(AVATAR_SIZE + 6);
      expect(styles.avatarGradientBorder.height).toBe(AVATAR_SIZE + 6);
      expect(styles.avatarGradientBorder.borderRadius).toBe((AVATAR_SIZE + 6) / 2);
    });

    it('should use AVATAR_SIZE / 2 for avatarInnerBorder borderRadius', () => {
      expect(styles.avatarInnerBorder.borderRadius).toBe(AVATAR_SIZE / 2);
    });

    it('should use AVATAR_SIZE - 8 for avatarWithPeaks dimensions', () => {
      expect(styles.avatarWithPeaks.width).toBe(AVATAR_SIZE - 8);
      expect(styles.avatarWithPeaks.height).toBe(AVATAR_SIZE - 8);
      expect(styles.avatarWithPeaks.borderRadius).toBe((AVATAR_SIZE - 8) / 2);
    });

    it('should use AVATAR_SIZE - 8 for avatarEmptyWithPeaks dimensions', () => {
      expect(styles.avatarEmptyWithPeaks.width).toBe(AVATAR_SIZE - 8);
      expect(styles.avatarEmptyWithPeaks.height).toBe(AVATAR_SIZE - 8);
      expect(styles.avatarEmptyWithPeaks.borderRadius).toBe((AVATAR_SIZE - 8) / 2);
    });
  });

  // ===== Responsive util-dependent computations =====

  describe('responsive util-dependent styles', () => {
    let styles: ReturnType<typeof createProfileStyles>;
    const MOCK_WIDTH_CAPPED = 390;
    const MOCK_SCREEN_WIDTH = 390;

    beforeAll(() => {
      styles = createProfileStyles(mockLightColors);
    });

    it('should compute peakCard width from WIDTH_CAPPED', () => {
      expect(styles.peakCard.width).toBe((MOCK_WIDTH_CAPPED - 48) / 3);
    });

    it('should compute peakGroupCard width from WIDTH_CAPPED', () => {
      expect(styles.peakGroupCard.width).toBe((MOCK_WIDTH_CAPPED - 48) / 2);
    });

    it('should compute collectionCard width from WIDTH_CAPPED', () => {
      expect(styles.collectionCard.width).toBe((MOCK_WIDTH_CAPPED - 48) / 2);
    });

    it('should compute liveCard width from WIDTH_CAPPED', () => {
      expect(styles.liveCard.width).toBe((MOCK_WIDTH_CAPPED - 48) / 2);
    });

    it('should compute videoCard width from WIDTH_CAPPED', () => {
      expect(styles.videoCard.width).toBe((MOCK_WIDTH_CAPPED - 48) / 2);
    });

    it('should compute moreTabsContainer width from SCREEN_WIDTH', () => {
      expect(styles.moreTabsContainer.width).toBe(MOCK_SCREEN_WIDTH - 64);
    });
  });

  // ===== Specific style property checks =====

  describe('specific style properties', () => {
    let styles: ReturnType<typeof createProfileStyles>;

    beforeAll(() => {
      styles = createProfileStyles(mockLightColors);
    });

    it('container should have flex: 1', () => {
      expect(styles.container.flex).toBe(1);
    });

    it('coverAbsolute should be positioned absolutely at top-left', () => {
      expect(styles.coverAbsolute.position).toBe('absolute');
      expect(styles.coverAbsolute.top).toBe(0);
      expect(styles.coverAbsolute.left).toBe(0);
      expect(styles.coverAbsolute.right).toBe(0);
    });

    it('settingsBtn should have shadow properties', () => {
      expect(styles.settingsBtn.shadowColor).toBe('#000');
      expect(styles.settingsBtn.shadowOffset).toEqual({ width: 0, height: 1 });
      expect(styles.settingsBtn.shadowOpacity).toBe(0.5);
      expect(styles.settingsBtn.shadowRadius).toBe(2);
      expect(styles.settingsBtn.elevation).toBe(3);
    });

    it('settingsBtnFixed should have higher elevation than settingsBtn', () => {
      expect(styles.settingsBtnFixed.elevation).toBeGreaterThan(styles.settingsBtn.elevation);
    });

    it('displayName should use WorkSans-SemiBold font', () => {
      expect(styles.displayName.fontFamily).toBe('WorkSans-SemiBold');
    });

    it('peakCard should have height 180', () => {
      expect(styles.peakCard.height).toBe(180);
    });

    it('peakGroupCard should have height 200', () => {
      expect(styles.peakGroupCard.height).toBe(200);
    });

    it('qrCode should have 180x180 dimensions', () => {
      expect(styles.qrCode.width).toBe(180);
      expect(styles.qrCode.height).toBe(180);
    });

    it('bottomSpacer should have height 120', () => {
      expect(styles.bottomSpacer.height).toBe(120);
    });

    it('loadMoreBtn should center items with vertical padding', () => {
      expect(styles.loadMoreBtn.alignItems).toBe('center');
      expect(styles.loadMoreBtn.paddingVertical).toBe(16);
    });

    it('postsGrid should use flex row with wrap', () => {
      expect(styles.postsGrid.flexDirection).toBe('row');
      expect(styles.postsGrid.flexWrap).toBe('wrap');
    });

    it('masonryContainer should use flex row', () => {
      expect(styles.masonryContainer.flexDirection).toBe('row');
    });

    it('masonryColumn should have flex: 1', () => {
      expect(styles.masonryColumn.flex).toBe(1);
    });

    it('postCardWrapper should be an empty object (width set dynamically)', () => {
      expect(Object.keys(styles.postCardWrapper).length).toBe(0);
    });

    it('avatar should have borderWidth 4', () => {
      expect(styles.avatar.borderWidth).toBe(4);
    });

    it('avatarGradientBorder should have padding 3', () => {
      expect(styles.avatarGradientBorder.padding).toBe(3);
    });

    it('collectionCard should have shadow properties', () => {
      expect(styles.collectionCard.shadowColor).toBe('#000');
      expect(styles.collectionCard.shadowOffset).toEqual({ width: 0, height: 2 });
      expect(styles.collectionCard.shadowOpacity).toBe(0.08);
      expect(styles.collectionCard.elevation).toBe(3);
    });

    it('planningSlotDot should be a 12x12 circle', () => {
      expect(styles.planningSlotDot.width).toBe(12);
      expect(styles.planningSlotDot.height).toBe(12);
      expect(styles.planningSlotDot.borderRadius).toBe(6);
    });

    it('sessionDateBox should have width 60', () => {
      expect(styles.sessionDateBox.width).toBe(60);
    });

    it('livePlayBtn should be a 44x44 circle', () => {
      expect(styles.livePlayBtn.width).toBe(44);
      expect(styles.livePlayBtn.height).toBe(44);
      expect(styles.livePlayBtn.borderRadius).toBe(22);
    });

    it('groupEventList should have gap 0', () => {
      expect(styles.groupEventList.gap).toBe(0);
    });

    it('scrollContent should have flex: 1', () => {
      expect(styles.scrollContent.flex).toBe(1);
    });

    it('collectionMenuContainer should have top border radius 20', () => {
      expect(styles.collectionMenuContainer.borderTopLeftRadius).toBe(20);
      expect(styles.collectionMenuContainer.borderTopRightRadius).toBe(20);
    });
  });

  // ===== Both color sets produce valid styles =====

  describe('cross-theme consistency', () => {
    it('should produce the same set of keys for light and dark colors', () => {
      const lightStyles = createProfileStyles(mockLightColors, false);
      const darkStyles = createProfileStyles(mockDarkColors, true);

      const lightKeys = Object.keys(lightStyles).sort();
      const darkKeys = Object.keys(darkStyles).sort();

      expect(lightKeys).toEqual(darkKeys);
    });

    it('should have different container backgrounds for light vs dark', () => {
      const lightStyles = createProfileStyles(mockLightColors, false);
      const darkStyles = createProfileStyles(mockDarkColors, true);

      expect(lightStyles.container.backgroundColor).not.toBe(
        darkStyles.container.backgroundColor,
      );
    });

    it('should have different statsBlurContainer backgrounds for light vs dark', () => {
      const lightStyles = createProfileStyles(mockLightColors, false);
      const darkStyles = createProfileStyles(mockDarkColors, true);

      expect(lightStyles.statsBlurContainer.backgroundColor).not.toBe(
        darkStyles.statsBlurContainer.backgroundColor,
      );
    });

    it('should have different masonryCard borderColor for light vs dark', () => {
      const lightStyles = createProfileStyles(mockLightColors, false);
      const darkStyles = createProfileStyles(mockDarkColors, true);

      expect(lightStyles.masonryCard.borderColor).not.toBe(
        darkStyles.masonryCard.borderColor,
      );
    });
  });
});
