// src/components/BottomNav.js
import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect, LinearGradient, Stop, Defs } from 'react-native-svg';
import { useTabBar } from '../context/TabBarContext';
import { COLORS } from '../config/theme';

// ===== CUSTOM SVG ICONS =====

const HomeIconFilled = ({ size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path 
      d="M12 3L4 9V21H9V14H15V21H20V9L12 3Z" 
      fill={COLORS.dark}
    />
  </Svg>
);

const HomeIconOutline = ({ size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path 
      d="M3 9.5L12 3L21 9.5V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9.5Z" 
      stroke={COLORS.dark}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path 
      d="M9 22V12H15V22" 
      stroke={COLORS.dark}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

const PeaksIconFilled = ({ size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="4" width="20" height="16" rx="4" fill={COLORS.dark} />
    <Path 
      d="M10 8.5L16 12L10 15.5V8.5Z" 
      fill="white"
    />
  </Svg>
);

const PeaksIconOutline = ({ size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect 
      x="2" y="4" width="20" height="16" rx="4" 
      stroke={COLORS.dark}
      strokeWidth="2"
      fill="none"
    />
    <Path 
      d="M10 8.5L16 12L10 15.5V8.5Z" 
      stroke={COLORS.dark}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

const NotificationsIconFilled = ({ size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path 
      d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" 
      fill={COLORS.dark}
    />
    <Path 
      d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" 
      fill={COLORS.dark}
    />
  </Svg>
);

const NotificationsIconOutline = ({ size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path 
      d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" 
      stroke={COLORS.dark}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path 
      d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" 
      stroke={COLORS.dark}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

const CreateIcon = ({ size = 24 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Defs>
      <LinearGradient id="createGradient" x1="0" y1="0" x2="24" y2="24">
        <Stop offset="0" stopColor="#01B6C5" />
        <Stop offset="1" stopColor="#11E3A3" />
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

const ProfileIcon = ({ imageUri, isActive, size = 26 }) => (
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

export default function BottomNav({ state, navigation, onCreatePress }) {
  const insets = useSafeAreaInsets();
  const { bottomBarTranslate, barsOpacity, bottomBarHidden } = useTabBar();

  // Si sur Xplorer, ne pas afficher le BottomNav
  if (bottomBarHidden) {
    return null;
  }

  const tabs = [
    { name: 'Home', iconFilled: HomeIconFilled, iconOutline: HomeIconOutline },
    { name: 'Peaks', iconFilled: PeaksIconFilled, iconOutline: PeaksIconOutline },
    { name: 'CreateTab', isCreate: true },
    { name: 'Notifications', iconFilled: NotificationsIconFilled, iconOutline: NotificationsIconOutline },
    { name: 'Profile', isProfile: true },
  ];

  const handlePress = (tab, index) => {
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

            const IconComponent = isActive ? tab.iconFilled : tab.iconOutline;

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