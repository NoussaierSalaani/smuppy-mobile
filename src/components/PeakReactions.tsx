import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

// Smuppy Icons - Unique fitness-themed icons
import SmuppyHeartIcon from './icons/SmuppyHeartIcon';
import SmuppyFireIcon from './icons/SmuppyFireIcon';
import SmuppyDoubleFlexIcon from './icons/SmuppyDoubleFlexIcon';
import SmuppyEnergyBurstIcon from './icons/SmuppyEnergyBurstIcon';
import SmuppyCelebrationBurstIcon from './icons/SmuppyCelebrationBurstIcon';
import SmuppyPeakFlagIcon from './icons/SmuppyPeakFlagIcon';

// Reaction types with their properties - Unique fitness-themed reactions
export type ReactionType = 'love' | 'fire' | 'strong' | 'energy' | 'bravo' | 'goal' | 'sweat';

interface Reaction {
  type: ReactionType;
  icon: React.FC<{ size: number; color: string; filled?: boolean }>;
  label: string;
  color: string;
  gradient: [string, string];
}

const REACTIONS: Reaction[] = [
  {
    type: 'love',
    icon: SmuppyHeartIcon,
    label: 'Love',
    color: '#FF6B6B',
    gradient: ['#FF6B6B', '#FF8E8E'],
  },
  {
    type: 'fire',
    icon: SmuppyFireIcon,
    label: 'Hot!',
    color: '#FF6B35',
    gradient: ['#FF6B35', '#FFD93D'],
  },
  {
    type: 'strong',
    icon: SmuppyDoubleFlexIcon,
    label: 'Strong',
    color: '#0EBF8A',
    gradient: ['#0EBF8A', '#00B5C1'],
  },
  {
    type: 'energy',
    icon: SmuppyEnergyBurstIcon,
    label: 'Energy',
    color: '#FFD93D',
    gradient: ['#FFD93D', '#FFF176'],
  },
  {
    type: 'bravo',
    icon: SmuppyCelebrationBurstIcon,
    label: 'Bravo',
    color: '#FFD700',
    gradient: ['#FFD700', '#FFA500'],
  },
  {
    type: 'goal',
    icon: SmuppyPeakFlagIcon,
    label: 'Goal!',
    color: '#FF6B6B',
    gradient: ['#FF6B6B', '#FF9500'],
  },
];

type PeakReactionsProps = Readonly<{
  visible: boolean;
  onReact: (reactionType: ReactionType) => void;
  onClose: () => void;
  currentReaction?: ReactionType | null;
}>;


const PeakReactions: React.FC<PeakReactionsProps> = ({
  visible,
  onReact,
  onClose,
  currentReaction,
}) => {
  const containerAnim = useRef(new Animated.Value(0)).current;
  const reactionAnims = useRef(REACTIONS.map(() => new Animated.Value(0))).current;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scaleAnims = useRef(REACTIONS.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    if (visible) {
      // Show container
      Animated.spring(containerAnim, {
        toValue: 1,
        friction: 6,
        tension: 100,
        useNativeDriver: true,
      }).start();

      // Stagger reactions appearance
      reactionAnims.forEach((anim, index) => {
        anim.setValue(0);
        Animated.spring(anim, {
          toValue: 1,
          friction: 5,
          tension: 100,
          delay: index * 50,
          useNativeDriver: true,
        }).start();
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Animated.timing(containerAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handlePressIn = (index: number) => {
    setHoveredIndex(index);
    Animated.spring(scaleAnims[index], {
      toValue: 1.4,
      friction: 3,
      useNativeDriver: true,
    }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handlePressOut = (index: number) => {
    setHoveredIndex(null);
    Animated.spring(scaleAnims[index], {
      toValue: 1,
      friction: 3,
      useNativeDriver: true,
    }).start();
  };

  const handleReact = (reaction: Reaction) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onReact(reaction.type);
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: containerAnim,
          transform: [
            {
              translateY: containerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [20, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.reactionsBar}>
        {/* Glow background */}
        <View style={styles.glowBg} />

        {REACTIONS.map((reaction, index) => {
          const Icon = reaction.icon;
          const isSelected = currentReaction === reaction.type;
          const isHovered = hoveredIndex === index;

          return (
            <Animated.View
              key={reaction.type}
              style={[
                styles.reactionWrapper,
                {
                  opacity: reactionAnims[index],
                  transform: [
                    {
                      scale: Animated.multiply(
                        reactionAnims[index],
                        scaleAnims[index]
                      ),
                    },
                    {
                      translateY: reactionAnims[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: [30, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.reactionButton,
                  isSelected && styles.reactionButtonSelected,
                ]}
                onPressIn={() => handlePressIn(index)}
                onPressOut={() => handlePressOut(index)}
                onPress={() => handleReact(reaction)}
                activeOpacity={0.8}
              >
                {isSelected ? (
                  <LinearGradient
                    colors={reaction.gradient}
                    style={styles.selectedGradient}
                  >
                    <Icon size={28} color="#FFF" filled />
                  </LinearGradient>
                ) : (
                  <Icon
                    size={isHovered ? 32 : 26}
                    color={isHovered ? reaction.color : 'rgba(255,255,255,0.9)'}
                    filled={isHovered}
                  />
                )}
              </TouchableOpacity>

              {/* Label on hover */}
              {isHovered && (
                <Animated.View style={styles.labelContainer}>
                  <LinearGradient
                    colors={reaction.gradient}
                    style={styles.labelGradient}
                  >
                    <Text style={styles.labelText}>{reaction.label}</Text>
                  </LinearGradient>
                </Animated.View>
              )}
            </Animated.View>
          );
        })}
      </View>

      {/* Touch outside to close */}
      <TouchableOpacity
        style={styles.backdrop}
        onPress={onClose}
        activeOpacity={1}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: -500,
    left: -50,
    right: -50,
    bottom: -200,
    zIndex: -1,
  },
  reactionsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderRadius: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  glowBg: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 42,
    backgroundColor: 'rgba(14, 191, 138, 0.1)',
  },
  reactionWrapper: {
    alignItems: 'center',
  },
  reactionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  reactionButtonSelected: {
    backgroundColor: 'transparent',
  },
  selectedGradient: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  labelContainer: {
    position: 'absolute',
    top: -35,
    alignItems: 'center',
  },
  labelGradient: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
});

export default React.memo(PeakReactions);

// Export reaction types for use elsewhere
export { REACTIONS };
