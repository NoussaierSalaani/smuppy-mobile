// src/components/BottomNav.tsx
import React, { useState, useRef, memo } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
  Text,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { FEATURES } from '../config/featureFlags';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, LinearGradient as SvgLinearGradient, Stop, Defs } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useTabBar } from '../context/TabBarContext';
import { useTheme, type ThemeColors } from '../hooks/useTheme';
import { useUserStore, useAppStore } from '../stores';
import { SmuppyIcon } from './SmuppyLogo';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// ===== CUSTOM SVG ICONS =====

interface IconProps {
  size?: number;
  color?: string;
}

// Home icon from UI Kit - House shape with tilted roof
const HomeIconFilled = ({ size = 22, color = '#0A252F' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 20 21" fill="none">
    {/* House body with roof - filled */}
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.5601 3.3893C5.0178 5.277 3.7466 6.2209 3.2474 7.6151C3.2073 7.727 3.1713 7.8403 3.1394 7.9548C2.7414 9.3827 3.227 10.9099 4.198 13.9643C5.1691 17.0187 5.6546 18.5459 6.7978 19.462C6.8895 19.5355 6.9838 19.6055 7.0805 19.672C8.2863 20.5 9.8575 20.5 13 20.5C16.1425 20.5 17.7137 20.5 18.9195 19.672C19.0162 19.6055 19.1105 19.5355 19.2022 19.462C20.3454 18.5459 20.8309 17.0187 21.802 13.9643C22.773 10.9099 23.2586 9.3827 22.8606 7.9548C22.8287 7.8403 22.7927 7.727 22.7526 7.6151C22.2534 6.2209 20.9822 5.277 18.4399 3.3893C15.8976 1.5016 14.6265 0.5577 13.1747 0.5033C13.0583 0.4989 12.9417 0.4989 12.8253 0.5033C11.3735 0.5577 10.1024 1.5016 7.5601 3.3893ZM11.0934 15.1821C10.6985 15.1821 10.3784 15.5093 10.3784 15.9129C10.3784 16.3164 10.6985 16.6436 11.0934 16.6436H14.9066C15.3015 16.6436 15.6216 16.3164 15.6216 15.9129C15.6216 15.5093 15.3015 15.1821 14.9066 15.1821H11.0934Z"
      fill={color}
      transform="translate(-3, 0)"
    />
  </Svg>
);

const HomeIconOutline = ({ size = 22, color = '#0A252F' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 20 21" fill="none">
    {/* House body with roof - outline version (same shape) */}
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.5601 3.3893C5.0178 5.277 3.7466 6.2209 3.2474 7.6151C3.2073 7.727 3.1713 7.8403 3.1394 7.9548C2.7414 9.3827 3.227 10.9099 4.198 13.9643C5.1691 17.0187 5.6546 18.5459 6.7978 19.462C6.8895 19.5355 6.9838 19.6055 7.0805 19.672C8.2863 20.5 9.8575 20.5 13 20.5C16.1425 20.5 17.7137 20.5 18.9195 19.672C19.0162 19.6055 19.1105 19.5355 19.2022 19.462C20.3454 18.5459 20.8309 17.0187 21.802 13.9643C22.773 10.9099 23.2586 9.3827 22.8606 7.9548C22.8287 7.8403 22.7927 7.727 22.7526 7.6151C22.2534 6.2209 20.9822 5.277 18.4399 3.3893C15.8976 1.5016 14.6265 0.5577 13.1747 0.5033C13.0583 0.4989 12.9417 0.4989 12.8253 0.5033C11.3735 0.5577 10.1024 1.5016 7.5601 3.3893ZM11.0934 15.1821C10.6985 15.1821 10.3784 15.5093 10.3784 15.9129C10.3784 16.3164 10.6985 16.6436 11.0934 16.6436H14.9066C15.3015 16.6436 15.6216 16.3164 15.6216 15.9129C15.6216 15.5093 15.3015 15.1821 14.9066 15.1821H11.0934Z"
      stroke={color}
      strokeWidth="1.5"
      fill="white"
      transform="translate(-3, 0)"
    />
  </Svg>
);

// Peaks icon from UI Kit - Rounded rectangle with play button
const PeaksIconFilled = ({ size = 22, color = '#0A252F' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 21 21" fill="none">
    {/* Rounded rectangle background - filled */}
    <Path
      d="M0.5 5C0.5 2.239 2.739 0 5.5 0H16C18.761 0 21 2.239 21 5V13C21 17.418 17.418 21 13 21H5.5C2.739 21 0.5 18.761 0.5 16V5Z"
      fill={color}
    />
    {/* Play button - white */}
    <Path
      d="M14.445 10.895C14.269 11.521 13.433 11.964 11.763 12.85C10.148 13.706 9.341 14.135 8.69 13.962C8.421 13.891 8.176 13.756 7.978 13.57C7.5 13.12 7.5 12.246 7.5 10.5C7.5 8.753 7.5 7.88 7.978 7.43C8.176 7.244 8.421 7.109 8.69 7.038C9.341 6.865 10.148 7.294 11.763 8.15C13.433 9.036 14.269 9.478 14.445 10.105C14.518 10.364 14.518 10.636 14.445 10.895Z"
      fill="white"
    />
  </Svg>
);

const PeaksIconOutline = ({ size = 22, color = '#0A252F' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 21 20" fill="none">
    {/* Rounded rectangle with chat bubble tail */}
    <Path
      d="M15.7 19.335C14.528 19.5 13 19.5 10.95 19.5H9.05C5.019 19.5 3.004 19.5 1.752 18.248C0.5 16.996 0.5 14.981 0.5 10.95V9.05C0.5 5.019 0.5 3.004 1.752 1.752C3.004 0.5 5.019 0.5 9.05 0.5H10.95C14.981 0.5 16.996 0.5 18.248 1.752C19.5 3.004 19.5 5.019 19.5 9.05V10.95C19.5 12.158 19.5 13.185 19.466 14.065C19.439 14.77 19.426 15.123 19.159 15.254C18.892 15.386 18.593 15.175 17.996 14.752L16.65 13.8"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Play button outline */}
    <Path
      d="M12.945 10.395C12.769 11.021 11.933 11.464 10.263 12.35C8.648 13.206 7.841 13.635 7.19 13.462C6.921 13.391 6.676 13.256 6.478 13.07C6 12.62 6 11.746 6 10C6 8.253 6 7.38 6.478 6.93C6.676 6.744 6.921 6.609 7.19 6.538C7.841 6.365 8.648 6.794 10.263 7.65C11.933 8.536 12.769 8.978 12.945 9.605C13.018 9.864 13.018 10.136 12.945 10.395Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

// Messages icon - Chat bubble shape
const MessagesIconFilled = ({ size = 22, color = '#0A252F' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2C6.477 2 2 6.477 2 12C2 13.89 2.525 15.66 3.438 17.168L2.071 20.668C1.872 21.184 2.132 21.764 2.648 21.963C2.813 22.026 2.993 22.037 3.165 21.993L7.415 20.923C8.82 21.612 10.373 22 12 22C17.523 22 22 17.523 22 12C22 6.477 17.523 2 12 2Z"
      fill={color}
    />
  </Svg>
);

const MessagesIconOutline = ({ size = 22, color = '#0A252F' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 3C7.029 3 3 7.029 3 12C3 13.689 3.466 15.274 4.287 16.628L3.016 19.832C2.76 20.478 3.303 21.14 3.985 20.994L7.789 20.158C9.05 20.693 10.447 21 12 21C16.971 21 21 16.971 21 12C21 7.029 16.971 3 12 3Z"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

const CreateIcon = ({ size = 24 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <SvgLinearGradient id="createGradient" x1="0" y1="0" x2="24" y2="24">
        <Stop offset="0" stopColor="#01B6C5" />
        <Stop offset="1" stopColor="#0EBF8A" />
      </SvgLinearGradient>
    </Defs>
    <Path
      d="M12 5V19M5 12H19"
      stroke="url(#createGradient)"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// Menu icons for pro_creator popup
const MenuLiveIcon = ({ size = 24 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" fill="white" />
    <Path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0 -8.49" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <Path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0 -14.14" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

const MenuPeaksIcon = ({ size = 24, color = '#0EBF8A' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="4" width="20" height="16" rx="4" stroke={color} strokeWidth="2" />
    <Path d="M15 12L10 9V15L15 12Z" fill={color} />
  </Svg>
);

const MenuPostIcon = ({ size = 24, color = '#0EBF8A' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="18" height="18" rx="4" stroke={color} strokeWidth="2" />
    <Path d="M12 8V16M8 12H16" stroke={color} strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

const MenuSessionsIcon = ({ size = 24 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M17 10.5V7C17 4.79 15.21 3 13 3H11C8.79 3 7 4.79 7 7V10.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <Path d="M12 14V17M12 17L14 15M12 17L10 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Rect x="4" y="10" width="16" height="11" rx="3" stroke="white" strokeWidth="2" />
  </Svg>
);

// Dashboard tab icons for pro_business bottom nav
const DashboardIconFilled = ({ size = 22, color = '#0A252F' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="7" height="7" rx="2" fill={color} />
    <Rect x="14" y="3" width="7" height="4" rx="2" fill={color} />
    <Rect x="3" y="14" width="7" height="4" rx="2" fill={color} />
    <Rect x="14" y="11" width="7" height="7" rx="2" fill={color} />
  </Svg>
);

const DashboardIconOutline = ({ size = 22, color = '#0A252F' }: IconProps & { color?: string }): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="7" height="7" rx="2" stroke={color} strokeWidth="1.5" />
    <Rect x="14" y="3" width="7" height="4" rx="2" stroke={color} strokeWidth="1.5" />
    <Rect x="3" y="14" width="7" height="4" rx="2" stroke={color} strokeWidth="1.5" />
    <Rect x="14" y="11" width="7" height="7" rx="2" stroke={color} strokeWidth="1.5" />
  </Svg>
);

// Menu icons for pro_business popup
const MenuDashboardIcon = ({ size = 24 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="3" width="7" height="7" rx="2" stroke="white" strokeWidth="2" />
    <Rect x="14" y="3" width="7" height="4" rx="2" stroke="white" strokeWidth="2" />
    <Rect x="3" y="14" width="7" height="4" rx="2" stroke="white" strokeWidth="2" />
    <Rect x="14" y="11" width="7" height="7" rx="2" stroke="white" strokeWidth="2" />
  </Svg>
);

const MenuPlanningIcon = ({ size = 24 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="3" y="4" width="18" height="17" rx="3" stroke="white" strokeWidth="2" />
    <Path d="M3 9H21" stroke="white" strokeWidth="2" />
    <Path d="M8 2V5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <Path d="M16 2V5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <Path d="M8 13H10" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <Path d="M14 13H16" stroke="white" strokeWidth="2" strokeLinecap="round" />
    <Path d="M8 17H10" stroke="white" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

interface ProfileIconProps {
  imageUri?: string;
  isActive: boolean;
  size?: number;
  activeColor: string;
}

// CDN URL normalization - fix legacy URLs pointing to wrong CloudFront
const WRONG_CDN = 'd3gy4x1feicix3.cloudfront.net';
const CORRECT_CDN = 'dc8kq67t0asis.cloudfront.net';
const normalizeCdnUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  return url.includes(WRONG_CDN) ? url.replace(WRONG_CDN, CORRECT_CDN) : url;
};

const ProfileIcon = ({ imageUri, isActive, size = 26, activeColor }: ProfileIconProps): React.JSX.Element => {
  const normalizedUri = normalizeCdnUrl(imageUri);

  const profileContainerStyle = React.useMemo(() => ({
    overflow: 'hidden' as const,
    borderWidth: 2,
    borderColor: isActive ? activeColor : 'transparent',
    width: size,
    height: size,
    borderRadius: size / 2,
  }), [isActive, activeColor, size]);

  const profileImageStyle = React.useMemo(() => ({
    width: '100%' as const,
    height: '100%' as const,
  }), []);

  return (
    <View style={profileContainerStyle}>
      {normalizedUri ? (
        <Image
          source={{ uri: normalizedUri }}
          style={profileImageStyle}
        />
      ) : (
        <View style={[profileImageStyle, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5E7EB' }]}>
          <Ionicons name="person" size={size * 0.6} color="#9CA3AF" />
        </View>
      )}
    </View>
  );
};

interface TabConfig {
  name: string;
  iconFilled?: React.ComponentType<IconProps>;
  iconOutline?: React.ComponentType<IconProps>;
  isCreate?: boolean;
  isProfile?: boolean;
}

interface BottomNavProps {
  state: BottomTabBarProps['state'];
  navigation: BottomTabBarProps['navigation'];
  onCreatePress?: () => void;
}

/**
 * BottomNav - Main tab navigation bar
 * Memoized for performance - renders on every screen
 */
const BottomNav = memo(function BottomNav({ state, navigation, onCreatePress }: BottomNavProps): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const { bottomBarTranslate, barsOpacity, bottomBarHidden } = useTabBar();
  const { colors, isDark, gradients } = useTheme();

  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Separate checks: creator-only features vs shared pro styling
  const user = useUserStore((state) => state.user);
  const unreadMessages = useAppStore((state) => state.unreadMessages);
  const isProCreator = user?.accountType === 'pro_creator';
  const isPro = isProCreator || user?.accountType === 'pro_business';

  // Pro creator menu state
  const [showProMenu, setShowProMenu] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const openProMenu = () => {
    setShowProMenu(true);
    Animated.spring(menuAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  };

  const closeProMenu = () => {
    Animated.timing(menuAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => setShowProMenu(false));
  };

  const handleMenuOption = (option: 'live' | 'peaks' | 'post' | 'sessions' | 'dashboard' | 'planning') => {
    closeProMenu();
    // Navigate based on option — gated by feature flags
    if (option === 'live' && FEATURES.GO_LIVE) {
      navigation.navigate('GoLive');
    } else if (option === 'peaks') {
      navigation.navigate('CreatePeak');
    } else if (option === 'sessions' && FEATURES.PRIVATE_SESSIONS) {
      navigation.navigate('PrivateSessionsManage');
    } else if (option === 'dashboard') {
      navigation.navigate('BusinessDashboard');
    } else if (option === 'planning') {
      navigation.navigate('BusinessScheduleUpload');
    } else {
      navigation.navigate('CreatePost');
    }
  };

  // Si sur Xplorer, ne pas afficher le BottomNav
  if (bottomBarHidden) {
    return null;
  }

  const isBusiness = user?.accountType === 'pro_business';

  const tabs: TabConfig[] = [
    { name: 'Home', iconFilled: HomeIconFilled, iconOutline: HomeIconOutline },
    isBusiness
      ? { name: 'Peaks', iconFilled: DashboardIconFilled, iconOutline: DashboardIconOutline }
      : { name: 'Peaks', iconFilled: PeaksIconFilled, iconOutline: PeaksIconOutline },
    { name: 'CreateTab', isCreate: true },
    { name: 'Messages', iconFilled: MessagesIconFilled, iconOutline: MessagesIconOutline },
    { name: 'Profile', isProfile: true },
  ];

  const handlePress = (tab: TabConfig, index: number): void => {
    if (tab.isCreate) {
      onCreatePress?.();
      return;
    }

    // Business: redirect Peaks tab to Dashboard
    if (isBusiness && tab.name === 'Peaks') {
      navigation.navigate('BusinessDashboard');
      return;
    }

    const event = navigation.emit({
      type: 'tabPress',
      target: state.routes[index].key,
      canPreventDefault: true,
    });

    if (!event.defaultPrevented) {
      navigation.navigate(tab.name);
    }
  };

  const bottomPadding = isBusiness ? 0 : (insets.bottom > 0 ? insets.bottom : 20);
  const businessBottomInset = isBusiness ? insets.bottom : 0;

  return (
    <Animated.View
      style={[
        styles.container,
        isBusiness && styles.businessContainer,
        {
          bottom: bottomPadding,
          transform: [{ translateY: bottomBarTranslate }],
          opacity: barsOpacity,
        },
      ]}
    >
      {/* Green border wrapper — pro gets gradient, business gets none, personal gets solid green outline */}
      {isBusiness ? null : isPro ? (
        <LinearGradient
          colors={gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.proBorderWrapper}
        />
      ) : (
        <View style={styles.personalBorderWrapper} />
      )}
      <BlurView intensity={80} tint={isDark ? "dark" : "light"} style={[styles.blurContainer, isBusiness ? styles.businessBlurContainer : styles.proBlurContainer, { backgroundColor: isDark ? 'rgba(13,13,13,0.92)' : 'rgba(255,255,255,0.92)', paddingBottom: businessBottomInset }]}>
        <View style={styles.tabsContainer}>
          {tabs.map((tab, index) => {
            const isActive = state.index === index;

            if (tab.isCreate) {
              // Pro accounts get Smuppy "S" icon button with menu
              if (isPro) {
                return (
                  <TouchableOpacity
                    key={tab.name}
                    style={styles.tab}
                    onPress={openProMenu}
                    activeOpacity={0.8}
                    testID="create-tab"
                  >
                    <View style={[styles.proSmuppyButton, { shadowColor: colors.dark }]}>
                      <SmuppyIcon size={46} variant="dark" />
                    </View>
                  </TouchableOpacity>
                );
              }
              // Regular user gets the standard create button
              return (
                <TouchableOpacity
                  key={tab.name}
                  style={styles.tab}
                  onPress={() => handlePress(tab, index)}
                  activeOpacity={0.7}
                  testID="create-tab"
                >
                  <View style={[styles.createButton, { backgroundColor: isDark ? 'rgba(13,13,13,0.95)' : 'rgba(255,255,255,0.95)', borderColor: colors.primary, shadowColor: colors.primary }]}>
                    <CreateIcon size={22} />
                  </View>
                </TouchableOpacity>
              );
            }

            if (tab.isProfile) {
              return (
                <TouchableOpacity
                  key={tab.name}
                  style={styles.tab}
                  onPress={() => handlePress(tab, index)}
                  activeOpacity={0.7}
                  testID="profile-tab"
                >
                  <ProfileIcon imageUri={user?.avatar || undefined} isActive={isActive} size={26} activeColor={colors.dark} />
                  {isActive ? <View style={[styles.underline, { backgroundColor: colors.dark }]} /> : null}
                </TouchableOpacity>
              );
            }

            const IconComponent = isActive ? tab.iconFilled! : tab.iconOutline!;
            const badgeCount = tab.name === 'Messages' ? unreadMessages : 0;

            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.tab}
                onPress={() => handlePress(tab, index)}
                activeOpacity={0.7}
                testID={`${tab.name.toLowerCase()}-tab`}
              >
                <View>
                  <IconComponent size={22} color={colors.dark} />
                  {badgeCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
                    </View>
                  )}
                </View>
                {isActive ? <View style={[styles.underline, { backgroundColor: colors.dark }]} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>

      {/* Pro Creator Menu Popup */}
      {showProMenu && (
        <Modal
          transparent
          visible={showProMenu}
          animationType="none"
          onRequestClose={closeProMenu}
        >
          <Pressable style={styles.menuOverlay} onPress={closeProMenu}>
            <Animated.View
              style={[
                styles.menuContainer,
                {
                  bottom: 80 + bottomPadding,
                  opacity: menuAnim,
                  transform: [
                    {
                      scale: menuAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1],
                      }),
                    },
                    {
                      translateY: menuAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [20, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <BlurView intensity={90} tint={isDark ? "dark" : "light"} style={[styles.menuBlur, { backgroundColor: isDark ? 'rgba(13,13,13,0.95)' : 'rgba(255,255,255,0.95)' }]}>
                {/* Live Option - Creator only */}
                {FEATURES.GO_LIVE && isProCreator && (
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => handleMenuOption('live')}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={gradients.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.menuIconBg}
                  >
                    <MenuLiveIcon size={20} />
                  </LinearGradient>
                  <Text style={[styles.menuOptionText, { color: colors.dark }]}>Live</Text>
                </TouchableOpacity>
                )}

                {/* Sessions Option - Creator only */}
                {FEATURES.PRIVATE_SESSIONS && isProCreator && (
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => handleMenuOption('sessions')}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={['#0081BE', '#00B5C1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.menuIconBg}
                  >
                    <MenuSessionsIcon size={20} />
                  </LinearGradient>
                  <Text style={[styles.menuOptionText, { color: colors.dark }]}>Sessions</Text>
                </TouchableOpacity>
                )}

                {/* Peaks Option - Creator only */}
                {isProCreator && (
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => handleMenuOption('peaks')}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuIconBgLight}>
                    <MenuPeaksIcon size={20} color={colors.primary} />
                  </View>
                  <Text style={[styles.menuOptionText, { color: colors.dark }]}>Peaks</Text>
                </TouchableOpacity>
                )}

                {/* Business Options */}
                {!isProCreator && FEATURES.BUSINESS_DASHBOARD && (
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => handleMenuOption('dashboard')}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={gradients.primary}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.menuIconBg}
                  >
                    <MenuDashboardIcon size={20} />
                  </LinearGradient>
                  <Text style={[styles.menuOptionText, { color: colors.dark }]}>Dashboard</Text>
                </TouchableOpacity>
                )}

                {!isProCreator && FEATURES.BUSINESS_DASHBOARD && (
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => handleMenuOption('planning')}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={['#0081BE', '#00B5C1']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.menuIconBg}
                  >
                    <MenuPlanningIcon size={20} />
                  </LinearGradient>
                  <Text style={[styles.menuOptionText, { color: colors.dark }]}>Planning</Text>
                </TouchableOpacity>
                )}

                {/* Post Option */}
                <TouchableOpacity
                  style={styles.menuOption}
                  onPress={() => handleMenuOption('post')}
                  activeOpacity={0.7}
                >
                  <View style={styles.menuIconBgLight}>
                    <MenuPostIcon size={20} color={colors.primary} />
                  </View>
                  <Text style={[styles.menuOptionText, { color: colors.dark }]}>Poste</Text>
                </TouchableOpacity>
              </BlurView>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </Animated.View>
  );
});

export default BottomNav;

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 100,
  },
  blurContainer: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    shadowColor: '#0A252F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 12,
  },
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 56,
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    position: 'relative',
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  underline: {
    position: 'absolute',
    bottom: 8,
    width: 18,
    height: 3,
    backgroundColor: colors.dark,
    borderRadius: 1.5,
  },
  profileContainer: {
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  profileActive: {
    borderColor: colors.dark,
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },

  // ===== BUSINESS ACCOUNT STYLES =====
  businessContainer: {
    left: 0,
    right: 0,
  },
  businessBlurContainer: {
    borderRadius: 0,
  },

  // ===== PERSONAL ACCOUNT STYLES =====
  personalBorderWrapper: {
    position: 'absolute',
    top: -1.5,
    left: -1.5,
    right: -1.5,
    bottom: -1.5,
    borderRadius: 29.5,
    borderWidth: 1.5,
    borderColor: '#0EBF8A',
  },

  // ===== PRO CREATOR STYLES =====
  proBorderWrapper: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 30,
  },
  proBlurContainer: {
    borderWidth: 0,
  },
  proSmuppyButton: {
    shadowColor: colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },

  // ===== PRO CREATOR MENU =====
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  menuContainer: {
    position: 'absolute',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  menuBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 16,
  },
  menuOption: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  menuIconBg: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  menuIconBgLight: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(14, 191, 138, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  menuOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.dark,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: '#FF3B30',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
