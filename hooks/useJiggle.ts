import { useEffect } from 'react';
import { 
  useAnimatedStyle, 
  useSharedValue, 
  withRepeat, 
  withSequence, 
  withTiming, 
  withDelay, 
  withSpring, 
  cancelAnimation 
} from 'react-native-reanimated';

export const useJiggle = (index: number, isEditing: boolean, isActive: boolean) => {
  const phaseDelay = (index * 23) % 150;
  
  const rotation = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const zIndex = useSharedValue(0);

  useEffect(() => {
    zIndex.value = isActive ? 999 : isEditing ? 1 : 0;

    if (isEditing && !isActive) {
      // ±1.5° rotation jiggle with multi-axis fluid loop
      rotation.value = withDelay(
        phaseDelay,
        withRepeat(withSequence(withTiming(-1.5, { duration: 110 }), withTiming(1.5, { duration: 110 })), -1, true)
      );
      translateX.value = withDelay(
        phaseDelay,
        withRepeat(withSequence(withTiming(-0.5, { duration: 90 }), withTiming(0.5, { duration: 90 })), -1, true)
      );
      translateY.value = withDelay(
        phaseDelay,
        withRepeat(withSequence(withTiming(0.5, { duration: 95 }), withTiming(-0.5, { duration: 95 })), -1, true)
      );
    } else {
      // Soft-rest return to base values when exiting edit mode or during active drag
      cancelAnimation(rotation);
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      
      rotation.value = withSpring(0, { damping: 15, stiffness: 200 });
      translateX.value = withSpring(0, { damping: 15, stiffness: 200 });
      translateY.value = withSpring(0, { damping: 15, stiffness: 200 });
    }
  }, [isEditing, isActive, phaseDelay]);

  const animatedStyle = useAnimatedStyle(() => {
    const scaleVal = isActive ? 1.05 : 1;
    return {
      transform: [
        { rotate: `${rotation.value}deg` },
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: withSpring(scaleVal, { damping: 18, stiffness: 250 }) }
      ],
      zIndex: zIndex.value,
      shadowOpacity: isActive ? 0.5 : 0,
      shadowRadius: isActive ? 24 : 0,
      elevation: isActive ? 12 : 0,
    };
  });

  return animatedStyle;
};
