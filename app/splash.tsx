import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    // Cinematic delay before routing to the onboarding lines selector
    const timer = setTimeout(() => {
      router.replace('/onboarding/lines');
    }, 3500);
    
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View 
        entering={FadeIn.duration(1200)} 
        exiting={FadeOut.duration(800)}
        style={styles.content}
      >
        <Text style={styles.title}>MY COMMUTE</Text>
        
        <Animated.Text 
          entering={SlideInDown.delay(600).duration(1000).springify()} 
          style={styles.subtitle}
        >
          LONDON UNDERGROUND
        </Animated.Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#050505', // Deep premium black
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  content: {
    alignItems: 'center',
  },
  title: { 
    color: '#FFFFFF', 
    fontSize: 36, 
    fontWeight: '900', 
    letterSpacing: 6,
  },
  subtitle: { 
    color: '#A0A0A0', 
    fontSize: 14, 
    fontWeight: '600', 
    letterSpacing: 3, 
    marginTop: 12 
  }
});