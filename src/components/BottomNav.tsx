// src/components/BottomNav.tsx
import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, LinearGradient, Stop, Defs } from 'react-native-svg';
import { useTabBar } from '../context/TabBarContext';
import { COLORS } from '../config/theme';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// ===== CUSTOM SVG ICONS =====

interface IconProps {
  size?: number;
}

// Home icon from UI Kit - House shape with tilted roof
const HomeIconFilled = ({ size = 22 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 20 21" fill="none">
    {/* House body with roof - filled */}
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.5601 3.3893C5.0178 5.277 3.7466 6.2209 3.2474 7.6151C3.2073 7.727 3.1713 7.8403 3.1394 7.9548C2.7414 9.3827 3.227 10.9099 4.198 13.9643C5.1691 17.0187 5.6546 18.5459 6.7978 19.462C6.8895 19.5355 6.9838 19.6055 7.0805 19.672C8.2863 20.5 9.8575 20.5 13 20.5C16.1425 20.5 17.7137 20.5 18.9195 19.672C19.0162 19.6055 19.1105 19.5355 19.2022 19.462C20.3454 18.5459 20.8309 17.0187 21.802 13.9643C22.773 10.9099 23.2586 9.3827 22.8606 7.9548C22.8287 7.8403 22.7927 7.727 22.7526 7.6151C22.2534 6.2209 20.9822 5.277 18.4399 3.3893C15.8976 1.5016 14.6265 0.5577 13.1747 0.5033C13.0583 0.4989 12.9417 0.4989 12.8253 0.5033C11.3735 0.5577 10.1024 1.5016 7.5601 3.3893ZM11.0934 15.1821C10.6985 15.1821 10.3784 15.5093 10.3784 15.9129C10.3784 16.3164 10.6985 16.6436 11.0934 16.6436H14.9066C15.3015 16.6436 15.6216 16.3164 15.6216 15.9129C15.6216 15.5093 15.3015 15.1821 14.9066 15.1821H11.0934Z"
      fill={COLORS.dark}
      transform="translate(-3, 0)"
    />
  </Svg>
);

const HomeIconOutline = ({ size = 22 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 20 21" fill="none">
    {/* House body with roof - outline version (same shape) */}
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7.5601 3.3893C5.0178 5.277 3.7466 6.2209 3.2474 7.6151C3.2073 7.727 3.1713 7.8403 3.1394 7.9548C2.7414 9.3827 3.227 10.9099 4.198 13.9643C5.1691 17.0187 5.6546 18.5459 6.7978 19.462C6.8895 19.5355 6.9838 19.6055 7.0805 19.672C8.2863 20.5 9.8575 20.5 13 20.5C16.1425 20.5 17.7137 20.5 18.9195 19.672C19.0162 19.6055 19.1105 19.5355 19.2022 19.462C20.3454 18.5459 20.8309 17.0187 21.802 13.9643C22.773 10.9099 23.2586 9.3827 22.8606 7.9548C22.8287 7.8403 22.7927 7.727 22.7526 7.6151C22.2534 6.2209 20.9822 5.277 18.4399 3.3893C15.8976 1.5016 14.6265 0.5577 13.1747 0.5033C13.0583 0.4989 12.9417 0.4989 12.8253 0.5033C11.3735 0.5577 10.1024 1.5016 7.5601 3.3893ZM11.0934 15.1821C10.6985 15.1821 10.3784 15.5093 10.3784 15.9129C10.3784 16.3164 10.6985 16.6436 11.0934 16.6436H14.9066C15.3015 16.6436 15.6216 16.3164 15.6216 15.9129C15.6216 15.5093 15.3015 15.1821 14.9066 15.1821H11.0934Z"
      stroke={COLORS.dark}
      strokeWidth="1.5"
      fill="white"
      transform="translate(-3, 0)"
    />
  </Svg>
);

// Peaks icon from UI Kit - Rounded rectangle with play button
const PeaksIconFilled = ({ size = 22 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 21 21" fill="none">
    {/* Rounded rectangle background - filled */}
    <Path
      d="M0.5 5C0.5 2.239 2.739 0 5.5 0H16C18.761 0 21 2.239 21 5V13C21 17.418 17.418 21 13 21H5.5C2.739 21 0.5 18.761 0.5 16V5Z"
      fill={COLORS.dark}
    />
    {/* Play button - white */}
    <Path
      d="M14.445 10.895C14.269 11.521 13.433 11.964 11.763 12.85C10.148 13.706 9.341 14.135 8.69 13.962C8.421 13.891 8.176 13.756 7.978 13.57C7.5 13.12 7.5 12.246 7.5 10.5C7.5 8.753 7.5 7.88 7.978 7.43C8.176 7.244 8.421 7.109 8.69 7.038C9.341 6.865 10.148 7.294 11.763 8.15C13.433 9.036 14.269 9.478 14.445 10.105C14.518 10.364 14.518 10.636 14.445 10.895Z"
      fill="white"
    />
  </Svg>
);

const PeaksIconOutline = ({ size = 22 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 21 20" fill="none">
    {/* Rounded rectangle with chat bubble tail */}
    <Path
      d="M15.7 19.335C14.528 19.5 13 19.5 10.95 19.5H9.05C5.019 19.5 3.004 19.5 1.752 18.248C0.5 16.996 0.5 14.981 0.5 10.95V9.05C0.5 5.019 0.5 3.004 1.752 1.752C3.004 0.5 5.019 0.5 9.05 0.5H10.95C14.981 0.5 16.996 0.5 18.248 1.752C19.5 3.004 19.5 5.019 19.5 9.05V10.95C19.5 12.158 19.5 13.185 19.466 14.065C19.439 14.77 19.426 15.123 19.159 15.254C18.892 15.386 18.593 15.175 17.996 14.752L16.65 13.8"
      stroke={COLORS.dark}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    {/* Play button outline */}
    <Path
      d="M12.945 10.395C12.769 11.021 11.933 11.464 10.263 12.35C8.648 13.206 7.841 13.635 7.19 13.462C6.921 13.391 6.676 13.256 6.478 13.07C6 12.62 6 11.746 6 10C6 8.253 6 7.38 6.478 6.93C6.676 6.744 6.921 6.609 7.19 6.538C7.841 6.365 8.648 6.794 10.263 7.65C11.933 8.536 12.769 8.978 12.945 9.605C13.018 9.864 13.018 10.136 12.945 10.395Z"
      stroke={COLORS.dark}
      strokeWidth="1.8"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

// Notifications icon from UI Kit - Bell shape (exact paths from Figma)
const NotificationsIconFilled = ({ size = 22 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    {/* Smile/ding indicator at bottom */}
    <Path
      d="M13.357 18.176C13.713 17.628 13.237 17 12.584 17H7.416C6.763 17 6.287 17.628 6.643 18.176C7.356 19.274 8.593 20 10 20C11.407 20 12.644 19.274 13.357 18.176Z"
      fill={COLORS.dark}
    />
    {/* Bell body - filled */}
    <Path
      d="M18.586 15H1.404C0.629 15 0 14.371 0 13.596C0 13.215 0.155 12.851 0.429 12.586L1.457 11.592C1.849 11.214 2.07 10.692 2.068 10.147L2.061 7.996C2.046 3.584 5.619 0 10.03 0C14.432 0 18 3.568 18 7.97L18 10.172C18 10.702 18.211 11.211 18.586 11.586L19.586 12.586C19.851 12.851 20 13.211 20 13.586C20 14.367 19.367 15 18.586 15Z"
      fill={COLORS.dark}
    />
  </Svg>
);

const NotificationsIconOutline = ({ size = 22 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 20 20" fill="none">
    {/* Bell outline with ding circle */}
    <Path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M0 14.5959C0 14.2151 0.155 13.8506 0.429 13.586L1.458 12.5922C1.849 12.2139 2.07 11.6922 2.068 11.1476L2.059 7.9946C2.045 3.5832 5.618 0 10.029 0C14.431 0 18 3.5686 18 7.9707L18 11.1716C18 11.702 18.211 12.2107 18.586 12.5858L19.586 13.5858C19.851 13.851 20 14.2107 20 14.5858C20 15.3668 19.367 16 18.586 16H14C14 18.2091 12.209 20 10 20C7.791 20 6 18.2091 6 16H1.404C0.629 16 0 15.3714 0 14.5959ZM8 16C8 17.1046 8.895 18 10 18C11.105 18 12 17.1046 12 16H8ZM16 11.1716C16 12.2324 16.421 13.2499 17.172 14L2.879 14C3.642 13.246 4.071 12.2161 4.068 11.1416L4.059 7.9886C4.049 4.6841 6.725 2 10.029 2C13.327 2 16 4.6732 16 7.9707L16 11.1716Z"
      fill={COLORS.dark}
    />
  </Svg>
);

const CreateIcon = ({ size = 24 }: IconProps): React.JSX.Element => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="createGradient" x1="0" y1="0" x2="24" y2="24">
        <Stop offset="0" stopColor="#01B6C5" />
        <Stop offset="1" stopColor="#0EBF8A" />
      </LinearGradient>
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

interface ProfileIconProps {
  imageUri?: string;
  isActive: boolean;
  size?: number;
}

const ProfileIcon = ({ imageUri, isActive, size = 26 }: ProfileIconProps): React.JSX.Element => (
  <View style={[
    styles.profileContainer,
    { width: size, height: size, borderRadius: size / 2 },
    isActive && styles.profileActive
  ]}>
    <Image
      source={{ uri: imageUri || 'https://i.pravatar.cc/100?img=33' }}
      style={styles.profileImage}
    />
  </View>
);

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

export default function BottomNav({ state, navigation, onCreatePress }: BottomNavProps): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const { bottomBarTranslate, barsOpacity, bottomBarHidden } = useTabBar();

  // Si sur Xplorer, ne pas afficher le BottomNav
  if (bottomBarHidden) {
    return null;
  }

  const tabs: TabConfig[] = [
    { name: 'Home', iconFilled: HomeIconFilled, iconOutline: HomeIconOutline },
    { name: 'Peaks', iconFilled: PeaksIconFilled, iconOutline: PeaksIconOutline },
    { name: 'CreateTab', isCreate: true },
    { name: 'Notifications', iconFilled: NotificationsIconFilled, iconOutline: NotificationsIconOutline },
    { name: 'Profile', isProfile: true },
  ];

  const handlePress = (tab: TabConfig, index: number): void => {
    if (tab.isCreate) {
      onCreatePress?.();
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

  const bottomPadding = insets.bottom > 0 ? insets.bottom : 20;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          bottom: bottomPadding,
          transform: [{ translateY: bottomBarTranslate }],
          opacity: barsOpacity,
        },
      ]}
    >
      <BlurView intensity={80} tint="light" style={styles.blurContainer}>
        <View style={styles.tabsContainer}>
          {tabs.map((tab, index) => {
            const isActive = state.index === index;

            if (tab.isCreate) {
              return (
                <TouchableOpacity
                  key={tab.name}
                  style={styles.tab}
                  onPress={() => handlePress(tab, index)}
                  activeOpacity={0.7}
                >
                  <View style={styles.createButton}>
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
                >
                  <ProfileIcon isActive={isActive} size={26} />
                  {isActive && <View style={styles.underline} />}
                </TouchableOpacity>
              );
            }

            const IconComponent = isActive ? tab.iconFilled! : tab.iconOutline!;

            return (
              <TouchableOpacity
                key={tab.name}
                style={styles.tab}
                onPress={() => handlePress(tab, index)}
                activeOpacity={0.7}
              >
                <IconComponent size={22} />
                {isActive && <View style={styles.underline} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: COLORS.primary,
    shadowColor: COLORS.primary,
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
    backgroundColor: COLORS.dark,
    borderRadius: 1.5,
  },
  profileContainer: {
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  profileActive: {
    borderColor: COLORS.dark,
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
});
