/**
 * ErrorToast - Non-intrusive error notification
 * Grey (not red) to avoid collision with TfL disruption colors.
 * Auto-dismisses after 5 seconds or on tap.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ErrorToastProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  onRetry?: () => void;
  autoDismissMs?: number;
}

const ErrorToast: React.FC<ErrorToastProps> = ({
  message,
  visible,
  onDismiss,
  onRetry,
  autoDismissMs = 5000,
}) => {
  const slideAnim = useRef(new Animated.Value(-80)).current;

  const dismissToast = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: -80,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onDismiss());
  }, [slideAnim, onDismiss]);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 200,
        friction: 20,
      }).start();

      const timer = setTimeout(() => {
        dismissToast();
      }, autoDismissMs);

      return () => clearTimeout(timer);
    } else {
      slideAnim.setValue(-80);
    }
  }, [visible, autoDismissMs, dismissToast, slideAnim]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.accentBar} />
        <Ionicons name="cloud-offline-outline" size={18} color="#636366" style={styles.icon} />
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
        {onRetry && (
          <Pressable onPress={onRetry} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        )}
        <Pressable onPress={dismissToast} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="#666" />
        </Pressable>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    zIndex: 30,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(142, 142, 147, 0.12)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingRight: 12,
    overflow: 'hidden',
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#636366',
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  icon: {
    marginLeft: 10,
    marginRight: 8,
  },
  message: {
    flex: 1,
    fontSize: 13,
    color: '#3A3A3C',
    fontWeight: '500',
    lineHeight: 18,
  },
  retryButton: {
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  closeButton: {
    marginLeft: 6,
    padding: 4,
  },
});

export default ErrorToast;
