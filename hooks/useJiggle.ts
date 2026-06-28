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
  const isActiveShared = useSharedValue(isActive ? 1 : 0);
  const isEditingShared = useSharedValue(isEditing ? 1 : 0);

  useEffect(() => {
    isActiveShared.value = isActive ? 1 : 0;
  }, [isActive, isActiveShared]);

  useEffect(() => {
    isEditingShared.value = isEditing ? 1 : 0;
  }, [isEditing, isEditingShared]);

  useEffect(() => {
    zIndex.value = isActive ? 999 : isEditing ? 1 : 1;

    if (isEditing || isActive) {
      // When actively dragged (isActive), jiggle harder to signal edit intent
      const rotAmp = isActive ? -3.5 : -1.5;
      const txAmp = isActive ? -1.5 : -0.5;
      const tyAmp = isActive ? 1.5 : 0.5;
      const duration = isActive ? 90 : 110;

      // ±rotAmp° rotation jiggle with multi-axis fluid loop
      rotation.value = withDelay(
        phaseDelay,
        withRepeat(withSequence(withTiming(rotAmp, { duration }), withTiming(-rotAmp, { duration })), -1, true)
      );
      translateX.value = withDelay(
        phaseDelay,
        withRepeat(withSequence(withTiming(txAmp, { duration: duration - 20 }), withTiming(-txAmp, { duration: duration - 20 })), -1, true)
      );
      translateY.value = withDelay(
        phaseDelay,
        withRepeat(withSequence(withTiming(tyAmp, { duration: duration - 15 }), withTiming(-tyAmp, { duration: duration - 15 })), -1, true)
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
  }, [isEditing, isActive, phaseDelay, rotation, translateX, translateY, zIndex]);

  const animatedStyle = useAnimatedStyle(() => {
    const active = isActiveShared.value === 1;
    const editing = isEditingShared.value === 1;

    // Show jiggle transforms when editing OR when actively dragged (long-pressed)
    if (!editing && !active) {
      return {
        transform: [{ scale: 1 }],
        zIndex: 1,
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      };
    }

    // Amplify jiggle on the actively-dragged card so it stands out from the crowd
    const rotStr = `${rotation.value}deg`;
    const tx = translateX.value;
    const ty = translateY.value;

    return {
      transform: [
        { rotate: rotStr },
        { translateX: tx },
        { translateY: ty },
        { scale: active ? 0.92 : 1 },
      ],
      zIndex: active ? 999 : 1,
      shadowOpacity: active ? 0.5 : 0,
      shadowRadius: active ? 24 : 0,
      elevation: active ? 12 : 0,
    };
  });

  return animatedStyle;
};
