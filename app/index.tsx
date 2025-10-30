import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  TextInput,
  Animated,
  Easing,
  PanResponder,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Dimensions,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import AddManageModal from './AddManageModal';
import { useRouter, useFocusEffect } from 'expo-router';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useLineData } from '../hooks/useLineData';
import { useLines, useLineDataStore } from '../store/lineDataStore';
import FCMService from '../services/fcmService';

// Global pre-fetch cache for station data
export const stationDataCache = new Map<string, Promise<any>>();

// Types
interface LineStatus {
  id: string;
  name: string;
  color: string;
  status: string;
  status_severity: number;
  reason?: string;
  updated_at: string;
}

interface Departure {
  line: string;
  destination: string;
  platform: string;
  expected_arrival: string;
  minutes_away: number;
}

interface StationData {
  id: string;
  name: string;
  lines: string[];
  departures: Departure[];
  updated_at: string;
}

interface UserPreferences {
  saved_lines: string[];
  saved_stations: string[];
  is_pro: boolean;
  trial_start_date?: string; // ISO date string when trial started
  trial_activated?: boolean; // Whether trial has ever been activated
  trial_expired_modal_shown?: boolean; // Track if trial expired modal was shown
  frozen_lines?: string[]; // Lines that are locked in free tier
  frozen_stations?: string[]; // Stations that are locked in free tier
  // NEW: Trial onboarding tracking
  welcome_modal_shown?: boolean; // Track if welcome modal was shown
  seven_day_warning_dismissed?: boolean; // Track if user dismissed 7-day warning
  in_trial_prompt_shown?: boolean; // Track if in-trial prompt was shown
}

const BACKEND_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_BACKEND_URL || process.env.EXPO_PUBLIC_BACKEND_URL;
console.log('🔧 MOBILE DEBUG - BACKEND_URL resolved to:', BACKEND_URL);

// Trial Management Constants
const TRIAL_DURATION_DAYS = 45;

// Trial Helper Functions
const getCurrentDateISO = (): string => new Date().toISOString();

const getTrialDaysRemaining = (trialStartDate: string): number => {
  const startDate = new Date(trialStartDate);
  const currentDate = new Date();
  const daysPassed = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DURATION_DAYS - daysPassed);
};

const isTrialActive = (userPrefs: UserPreferences): boolean => {
  if (!userPrefs.trial_start_date || !userPrefs.trial_activated) {
    console.log('🔍 Trial not active: no start date or not activated');
    return false;
  }
  const daysRemaining = getTrialDaysRemaining(userPrefs.trial_start_date);
  const active = daysRemaining > 0;
  console.log(`🔍 Trial check: ${daysRemaining} days remaining, active: ${active}`);
  return active;
};

const hasProAccess = (userPrefs: UserPreferences): boolean => {
  const isPro = userPrefs.is_pro;
  const trialActive = isTrialActive(userPrefs);
  const result = isPro || trialActive;
  console.log(`🔍 hasProAccess - isPro: ${isPro}, trialActive: ${trialActive}, result: ${result}`);
  return result;
};

// Phase 2 Helper Functions
const getTrialStatusMessage = (userPrefs: UserPreferences): string => {
  if (userPrefs.is_pro) return '';
  
  if (!userPrefs.trial_activated || !userPrefs.trial_start_date) {
    return 'Trial not activated';
  }
  
  const daysRemaining = getTrialDaysRemaining(userPrefs.trial_start_date);
  if (daysRemaining > 0) {
    return `${daysRemaining} days left in trial`;
  } else {
    return 'Trial expired';
  }
};

const getTrialCountdownColor = (daysRemaining: number): string => {
  if (daysRemaining >= 30) return '#28a745'; // Green
  if (daysRemaining >= 7) return '#ffc107';  // Yellow
  return '#dc3545'; // Red
};

const shouldShowUpgradeBanner = (userPrefs: UserPreferences): boolean => {
  // ✅ FIX: Don't show banner if user already saw the modal
  // Banner should NEVER show - modal is the primary notification
  return !userPrefs.is_pro && 
         userPrefs.trial_activated && 
         getTrialDaysRemaining(userPrefs.trial_start_date || '') === 0 &&
         userPrefs.trial_expired_modal_shown !== true; // Show banner ONLY if modal NOT shown yet
};

const canAddMoreItems = (userPrefs: UserPreferences): boolean => {
  // During active trial or pro: unlimited
  if (hasProAccess(userPrefs)) return true;
  
  // After trial expires: FREE TIER LIMIT = 3 ACTIVE items
  // Must use getActiveItemsCount to exclude frozen items
  const activeItems = getActiveItemsCount(userPrefs);
  return activeItems < 3;
};

const getTotalItemsCount = (userPrefs: UserPreferences): number => {
  return userPrefs.saved_lines.length + userPrefs.saved_stations.length;
};

const getActiveItemsCount = (userPrefs: UserPreferences): number => {
  // During trial or pro: all items are active
  if (userPrefs.is_pro || isTrialActive(userPrefs)) {
    return getTotalItemsCount(userPrefs);
  }
  
  // After trial expires: count only non-frozen items
  const activeLinesCount = userPrefs.saved_lines.length - (userPrefs.frozen_lines?.length || 0);
  const activeStationsCount = userPrefs.saved_stations.length - (userPrefs.frozen_stations?.length || 0);
  
  return activeLinesCount + activeStationsCount;
};

const getItemCounterText = (userPrefs: UserPreferences): string => {
  if (userPrefs.is_pro) return 'Pro';
  
  const trialActive = isTrialActive(userPrefs);
  
  if (trialActive) {
    const total = getTotalItemsCount(userPrefs);
    return `${total} items`;
  } else {
    // Free tier: show active items / 3
    const activeItems = getActiveItemsCount(userPrefs);
    return `${activeItems}/3 items`;
  }
};

const isItemFrozen = (userPrefs: UserPreferences, itemType: 'line' | 'station', itemId: string): boolean => {
  // Item is frozen if trial expired, not pro, and item is in the frozen list
  if (userPrefs.is_pro || isTrialActive(userPrefs)) return false;
  
  if (itemType === 'line') {
    return userPrefs.frozen_lines?.includes(itemId) || false;
  } else {
    return userPrefs.frozen_stations?.includes(itemId) || false;
  }
};

export default function MyCommuteDashboard() {
  const router = useRouter();
  const [userPrefs, setUserPrefs] = useState<UserPreferences>({
    saved_lines: ['central', 'victoria'], // 2 lines: Central & Victoria
    saved_stations: ['940GZZLUOXC', '940GZZLUKSX'], // 2 stations: Oxford Circus & King's Cross
    is_pro: false,
    trial_activated: false,
    trial_start_date: undefined,
  });

  // Keyboard handling for better station search UX
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // Phase 2 - UI/UX state management
  const [showTrialExpiredModal, setShowTrialExpiredModal] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [upgradeBannerDismissedThisSession, setUpgradeBannerDismissedThisSession] = useState(false);
  
  // NEW: Trial onboarding state
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showSevenDayWarning, setShowSevenDayWarning] = useState(false);
  const [showInTrialPrompt, setShowInTrialPrompt] = useState(false);
  
  // NEW: Contextual upgrade modals
  const [showAddItemUpgradeModal, setShowAddItemUpgradeModal] = useState(false);
  const [showFrozenItemModal, setShowFrozenItemModal] = useState(false);
  const [selectedFrozenItem, setSelectedFrozenItem] = useState<{type: 'line' | 'station', name: string} | null>(null);
  
  // Add/Manage Modal state
  const [showAddManageModal, setShowAddManageModal] = useState(false);
  const [stationData, setStationData] = useState<{ [key: string]: StationData }>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // ✅ ZUSTAND MIGRATION: Use central store for line data
  const allLinesFromStore = useLines(); // Get all lines from Zustand store
  const isLoadingLines = useLineDataStore(state => state.isLoading); // Get loading state
  const { fetchAllLines, refreshLines } = useLineData(); // Get fetching methods
  const [lineStatuses, setLineStatuses] = useState<LineStatus[]>([]); // Filtered lines for dashboard
  // Removed isSetupMode - not needed with new jiggle mode approach
  // ✅ ZUSTAND MIGRATION: allLines now comes from Zustand store via allLinesFromStore
  // Remove setupMode - all editing happens in jiggle mode on main dashboard
  const [isEditing, setIsEditing] = useState(false); // Jiggle Mode state
  const [showLineDropdown, setShowLineDropdown] = useState(false); // Lines dropdown
  // Old station search functionality removed - now handled by AddManageModal
  const scrollViewRef = useRef<ScrollView>(null);
  const stationsSectionRef = useRef<View>(null);
  const jiggleAnim = useRef(new Animated.Value(0)).current; // Jiggle animation value
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedLineDetail, setSelectedLineDetail] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<'lines' | 'stations' | null>(null);
  const [expandedLineCard, setExpandedLineCard] = useState<string | null>(null); // Track which specific line card is expanded
  const [expandedStationCard, setExpandedStationCard] = useState<string | null>(null); // Track which specific station card is expanded
  
  // Animation references for smooth card transformations
  const cardAnimationRefs = useRef<{[key: string]: Animated.Value}>({});
  
  // Debounced search state - MUST be declared before useEffect that uses it
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'live-status' | 'plan-journey'>('dashboard');
  const [editMode, setEditMode] = useState(false);

  // Mock feature flag for Pro features - removed dev mode toggle

  // Initial app setup - only load preferences once
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('🚀 Starting app initialization...');
        await loadUserPreferences();
        console.log('✅ User preferences loaded');
        
        // Initialize FCM for Android push notifications
        if (Platform.OS === 'android') {
          console.log('📱 Initializing FCM for Android...');
          // Use a simple user ID (in production, this should be a unique user identifier)
          const userId = 'user_android_' + Date.now();
          await FCMService.initialize(userId);
          console.log('✅ FCM initialized');
        }
      } catch (error) {
        console.error('❌ Error during app initialization:', error);
        setLoading(false);
      }
    };
    initializeApp();
  }, []);

  // Fetch data every time screen comes into focus
  // Track last fetch time to avoid unnecessary re-fetches
  const lastFetchTime = useRef<number>(0);
  const CACHE_DURATION = 30000; // 30 seconds cache

  useFocusEffect(
    React.useCallback(() => {
      console.log('🔄 Screen focused - checking if refresh needed...');
      
      const fetchOnFocus = async () => {
        const now = Date.now();
        const timeSinceLastFetch = now - lastFetchTime.current;
        
        // If lastFetchTime is 0, it means cache was invalidated - MUST refresh
        const cacheInvalidated = lastFetchTime.current === 0;
        
        // Only skip fetch if cache is fresh AND wasn't invalidated
        if (timeSinceLastFetch < CACHE_DURATION && lastFetchTime.current > 0 && !cacheInvalidated) {
          console.log(`⏭️ Skipping fetch - data is fresh (${Math.round(timeSinceLastFetch/1000)}s old)`);
          setLoading(false);
          return;
        }
        
        if (cacheInvalidated) {
          console.log('🔄 CACHE INVALIDATED - forcing fresh data fetch');
        }
        
        if (userPrefs.saved_lines.length > 0 || userPrefs.saved_stations.length > 0) {
          console.log('📡 useFocusEffect: Fetching dashboard data (cache expired or invalidated)');
          lastFetchTime.current = now;
          await fetchDashboardData(undefined, cacheInvalidated); // Pass forceRefresh flag
        } else {
          console.log('📡 useFocusEffect: No saved items, clearing loading');
          setLoading(false);
        }
      };
      
      fetchOnFocus();
    }, [userPrefs.saved_lines, userPrefs.saved_stations])
  );

  // Clean up duplicate entries only once after initial load to prevent loops
  useEffect(() => {
    // Only run cleanup if we have actual data loaded (not empty defaults)
    if (userPrefs.saved_lines.length === 0 && userPrefs.saved_stations.length === 0) {
      return; // Skip cleanup for empty initial state
    }
    
    const cleanedLines = [...new Set(userPrefs.saved_lines.filter(id => id && id.trim() !== ''))];
    const cleanedStations = [...new Set(userPrefs.saved_stations.filter(id => id && id.trim() !== ''))];
    
    // Only cleanup if there are actually duplicates or invalid entries
    const hasDuplicateLines = cleanedLines.length !== userPrefs.saved_lines.length;
    const hasDuplicateStations = cleanedStations.length !== userPrefs.saved_stations.length;
    const hasInvalidLines = userPrefs.saved_lines.some(id => !id || id.trim() === '');
    const hasInvalidStations = userPrefs.saved_stations.some(id => !id || id.trim() === '');
    
    if (hasDuplicateLines || hasDuplicateStations || hasInvalidLines || hasInvalidStations) {
      console.log('🧹 Setting cleanup flag and performing cleanup');
      console.log('🧹 Before - Lines:', userPrefs.saved_lines, 'Stations:', userPrefs.saved_stations);
      console.log('🧹 After - Lines:', cleanedLines, 'Stations:', cleanedStations);
      
      const cleanedPrefs = {
        ...userPrefs,
        saved_lines: cleanedLines,
        saved_stations: cleanedStations
      };
      saveUserPreferences(cleanedPrefs);
    }
  }, [userPrefs.saved_lines, userPrefs.saved_stations]); // Only run when userPrefs is fully loaded

  // Cleanup search timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, []); // Empty dependency array since searchTimeout is ref-like

  // REMOVED: Problematic useEffect with dependencies - using explicit imperative flow instead

  // Keyboard event listeners for better mobile UX
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (e) => {
        console.log('🔌 Keyboard shown:', e.endCoordinates.height);
        setKeyboardHeight(e.endCoordinates.height);
        setIsKeyboardVisible(true);
      }
    );

    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        console.log('🔌 Keyboard hidden');
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    );

    return () => {
      keyboardDidShowListener?.remove();
      keyboardDidHideListener?.remove();
    };
  }, []);

  // CRITICAL: Keyboard management for seamless user experience
  useEffect(() => {
    const keyboardShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );

    const keyboardHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardShowListener?.remove();
      keyboardHideListener?.remove();
    };
  }, []);

  // Watch for userPrefs changes and update warning banners
  useEffect(() => {
    if (!userPrefs.trial_start_date) return;
    
    const daysRemaining = getTrialDaysRemaining(userPrefs.trial_start_date);
    
    // Update 7-day warning visibility
    if (!userPrefs.is_pro && 
        userPrefs.trial_activated && 
        !userPrefs.seven_day_warning_dismissed &&
        daysRemaining > 0 && 
        daysRemaining <= 7) {
      setShowSevenDayWarning(true);
    } else {
      setShowSevenDayWarning(false);
    }
    
    // Update in-trial prompt visibility
    const totalItems = userPrefs.saved_lines.length + userPrefs.saved_stations.length;
    if (!userPrefs.is_pro &&
        userPrefs.trial_activated &&
        isTrialActive(userPrefs) &&
        !userPrefs.in_trial_prompt_shown &&
        totalItems >= 2) {
      setShowInTrialPrompt(true);
    } else {
      setShowInTrialPrompt(false);
    }
    
    // Update upgrade banner visibility
    if (!upgradeBannerDismissedThisSession) {
      setShowUpgradeBanner(shouldShowUpgradeBanner(userPrefs));
    }
    
  }, [userPrefs, upgradeBannerDismissedThisSession]);

  const loadUserPreferences = async () => {
    try {
      
      const savedPrefs = await AsyncStorage.getItem('user_preferences');
      
      if (savedPrefs) {
        // User has existing preferences
        const parsedPrefs = JSON.parse(savedPrefs);
        console.log('📱 Loading existing user preferences:', parsedPrefs);
        
        // Ensure all trial fields are present (migration for existing users)
        const migratedPrefs = {
          ...parsedPrefs,
          trial_activated: parsedPrefs.trial_activated ?? false,
          trial_start_date: parsedPrefs.trial_start_date ?? undefined,
          trial_expired_modal_shown: parsedPrefs.trial_expired_modal_shown ?? false,
          frozen_lines: parsedPrefs.frozen_lines ?? [],
          frozen_stations: parsedPrefs.frozen_stations ?? [],
        };
        
        setUserPrefs(migratedPrefs);
        console.log('✅ User preferences loaded:', migratedPrefs);
        
        // CHECK: Show trial expired modal if trial just expired
        const trialExpired = migratedPrefs.trial_activated && 
                            getTrialDaysRemaining(migratedPrefs.trial_start_date || '') === 0 &&
                            !migratedPrefs.is_pro &&
                            !migratedPrefs.trial_expired_modal_shown;
        
        if (trialExpired) {
          console.log('⚠️ Trial has expired - showing post-trial modal and freezing items');
          
          // FREEZE items beyond the 3-item limit
          const totalItems = migratedPrefs.saved_lines.length + migratedPrefs.saved_stations.length;
          let frozenLines: string[] = [];
          let frozenStations: string[] = [];
          
          if (totalItems > 3) {
            // Keep first 3 items active, freeze the rest
            const activeItemCount = 3;
            const linesCount = migratedPrefs.saved_lines.length;
            
            if (linesCount >= activeItemCount) {
              // All active slots taken by lines, freeze remaining lines and all stations
              frozenLines = migratedPrefs.saved_lines.slice(activeItemCount);
              frozenStations = [...migratedPrefs.saved_stations];
            } else {
              // Some stations can be active
              const activeStationsCount = activeItemCount - linesCount;
              frozenStations = migratedPrefs.saved_stations.slice(activeStationsCount);
            }
            
            console.log(`🔒 Freezing ${frozenLines.length} lines and ${frozenStations.length} stations`);
          }
          
          setShowTrialExpiredModal(true);
          // Mark modal as shown and save frozen items
          const updatedPrefs = { 
            ...migratedPrefs, 
            trial_expired_modal_shown: true,
            frozen_lines: frozenLines,
            frozen_stations: frozenStations,
          };
          await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
          setUserPrefs(updatedPrefs);
        }
        
        // CHECK: Show upgrade banner if trial expired
        if (shouldShowUpgradeBanner(migratedPrefs)) {
          setShowUpgradeBanner(true);
        }
        
        // CHECK: Show 7-day warning if trial is ending soon
        if (!migratedPrefs.is_pro && 
            migratedPrefs.trial_activated && 
            migratedPrefs.trial_start_date &&
            !migratedPrefs.seven_day_warning_dismissed) {
          const daysRemaining = getTrialDaysRemaining(migratedPrefs.trial_start_date);
          if (daysRemaining > 0 && daysRemaining <= 7) {
            console.log(`⏰ Trial ending in ${daysRemaining} days - showing warning`);
            setShowSevenDayWarning(true);
          }
        }
        
        // CHECK: Show in-trial prompt after user has 2+ items
        const totalItems = migratedPrefs.saved_lines.length + migratedPrefs.saved_stations.length;
        if (!migratedPrefs.is_pro &&
            migratedPrefs.trial_activated &&
            isTrialActive(migratedPrefs) &&
            !migratedPrefs.in_trial_prompt_shown &&
            totalItems >= 2) {
          console.log(`💡 User has ${totalItems} items during trial - showing feature prompt`);
          setShowInTrialPrompt(true);
        }
        
        // EXPLICIT FLOW: Now directly fetch dashboard data WITH the loaded prefs
        console.log('🚀 EXPLICIT: Calling fetchDashboardData with loaded preferences');
        await fetchDashboardData(migratedPrefs);
      } else {
        // First-time user - Auto-activate 45-day trial
        const currentDate = getCurrentDateISO();
        const newUserPrefs: UserPreferences = {
          saved_lines: ['central', 'victoria'], // Default 2 lines
          saved_stations: ['940GZZLUOXC', '940GZZLUKSX'], // Default 2 stations
          is_pro: false,
          trial_activated: true,
          trial_start_date: currentDate,
          trial_expired_modal_shown: false,
          frozen_lines: [],
          frozen_stations: [],
          welcome_modal_shown: false, // Will show welcome modal
          seven_day_warning_dismissed: false,
          in_trial_prompt_shown: false,
        };
        
        await AsyncStorage.setItem('user_preferences', JSON.stringify(newUserPrefs));
        setUserPrefs(newUserPrefs);
        
        // Show welcome modal for new users
        setShowWelcomeModal(true);
        
        console.log('🎉 Welcome! 45-day premium trial activated automatically');
        console.log(`🗓️ Trial started: ${currentDate}`);
        console.log(`📅 Trial expires: ${new Date(Date.now() + (TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)).toISOString()}`);
        console.log('🔍 NEW USER PREFS SET:', newUserPrefs);
        
        // EXPLICIT FLOW: Also fetch dashboard data for new users WITH the new prefs
        console.log('🚀 EXPLICIT: Calling fetchDashboardData with new user preferences');
        await fetchDashboardData(newUserPrefs);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      // Fallback to basic preferences without trial
      const fallbackPrefs: UserPreferences = {
        saved_lines: ['central', 'victoria'],
        saved_stations: ['940GZZLUOXC', '940GZZLUKSX'],
        is_pro: false,
        trial_activated: false,
        trial_start_date: undefined,
        trial_expired_modal_shown: false,
        frozen_lines: [],
        frozen_stations: [],
      };
      setUserPrefs(fallbackPrefs);
    }
  };

  // Jiggle Mode Functions
  const startJiggleAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(jiggleAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(jiggleAnim, {
          toValue: -1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(jiggleAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopJiggleAnimation = () => {
    jiggleAnim.stopAnimation();
    jiggleAnim.setValue(0);
  };

  const activateJiggleMode = () => {
    setIsEditing(true);
    startJiggleAnimation();
    console.log('🎯 Jiggle Mode Activated');
  };

  const deactivateJiggleMode = () => {
    setIsEditing(false);
    setShowLineDropdown(false);
    // Old search functionality removed
    stopJiggleAnimation();
    console.log('🎯 Jiggle Mode Deactivated');
  };

  // Reset to default 2 lines + 2 stations
  const resetToDefaults = async () => {
    try {
      await AsyncStorage.removeItem('user_preferences');
      const defaultPrefs = {
        saved_lines: ['central', 'victoria'], // Exactly 2 lines
        saved_stations: ['940GZZLUOXC', '940GZZLUKSX'], // Exactly 2 stations: Oxford Circus & King's Cross
        is_pro: false
      };
      setUserPrefs(defaultPrefs);
      await AsyncStorage.setItem('user_preferences', JSON.stringify(defaultPrefs));
      console.log('🔄 Reset to default 2 lines and 2 stations');
    } catch (error) {
      console.error('Error resetting preferences:', error);
    }
  };

  // Remove a line from dashboard
  const removeLine = async (lineId: string) => {
    try {
      // Check if this is a frozen item
      const isFrozen = isItemFrozen(userPrefs, 'line', lineId);
      
      if (isFrozen) {
        // Show confirmation modal for frozen items
        const lineName = lineStatuses.find(l => l.id === lineId)?.name || lineId;
        Alert.alert(
          'Remove This Item?',
          `You're removing a locked item. This will free up a slot for your free plan.\n\n"${lineName}"`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, Remove',
              style: 'destructive',
              onPress: async () => {
                const updatedPrefs = {
                  ...userPrefs,
                  saved_lines: userPrefs.saved_lines.filter(id => id !== lineId),
                  frozen_lines: (userPrefs.frozen_lines || []).filter(id => id !== lineId), // Remove from frozen list
                };
                setUserPrefs(updatedPrefs);
                await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
                console.log(`➖ Removed frozen line: ${lineId}`);
              }
            }
          ]
        );
      } else {
        // Regular removal without confirmation
        const updatedPrefs = {
          ...userPrefs,
          saved_lines: userPrefs.saved_lines.filter(id => id !== lineId),
          frozen_lines: (userPrefs.frozen_lines || []).filter(id => id !== lineId), // Also clean from frozen list if present
        };
        setUserPrefs(updatedPrefs);
        await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
        console.log(`➖ Removed line: ${lineId}`);
      }
    } catch (error) {
      console.error('Error removing line:', error);
    }
  };

  // Add a line to dashboard
  const addLine = async (lineId: string) => {
    try {
      // Check if line is already added
      if (userPrefs.saved_lines.includes(lineId)) {
        console.log(`Line ${lineId} already added`);
        return;
      }

      // UNLIMITED ACCESS DURING TRIAL - NO RESTRICTIONS
      console.log('✅ Adding line - unlimited access granted during trial period');

      const updatedPrefs = {
        ...userPrefs,
        saved_lines: [...userPrefs.saved_lines, lineId]
      };
      setUserPrefs(updatedPrefs);
      await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
      console.log(`➕ Added line: ${lineId}`);
      
      // Close dropdown after adding
      setShowLineDropdown(false);
    } catch (error) {
      console.error('Error adding line:', error);
    }
  };

  // Remove a station from dashboard
  const removeStation = async (stationId: string) => {
    try {
      // Check if this is a frozen item
      const isFrozen = isItemFrozen(userPrefs, 'station', stationId);
      
      if (isFrozen) {
        // Show confirmation modal for frozen items
        const stationName = stationData[stationId]?.name || stationId;
        Alert.alert(
          'Remove This Item?',
          `You're removing a locked item. This will free up a slot for your free plan.\n\n"${stationName}"`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Yes, Remove',
              style: 'destructive',
              onPress: async () => {
                const updatedPrefs = {
                  ...userPrefs,
                  saved_stations: userPrefs.saved_stations.filter(id => id !== stationId),
                  frozen_stations: (userPrefs.frozen_stations || []).filter(id => id !== stationId), // Remove from frozen list
                };
                setUserPrefs(updatedPrefs);
                await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
                console.log(`➖ Removed frozen station: ${stationId}`);
                
                // Also remove from stationData state
                setStationData(prevData => {
                  const newData = { ...prevData };
                  delete newData[stationId];
                  return newData;
                });
              }
            }
          ]
        );
      } else {
        // Regular removal without confirmation
        const updatedPrefs = {
          ...userPrefs,
          saved_stations: userPrefs.saved_stations.filter(id => id !== stationId),
          frozen_stations: (userPrefs.frozen_stations || []).filter(id => id !== stationId), // Also clean from frozen list if present
        };
        setUserPrefs(updatedPrefs);
        await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
        console.log(`➖ Removed station: ${stationId}`);
        
        // Also remove from stationData state
        setStationData(prevData => {
          const newData = { ...prevData };
          delete newData[stationId];
          return newData;
        });
      }
    } catch (error) {
      console.error('Error removing station:', error);
    }
  };

  // Handle Pro Upgrade
  const handleUpgradeToPro = async () => {
    Alert.alert(
      'Upgrade to Pro',
      'Get lifetime access with a one-time payment. No subscriptions, ever.\n\n✅ Unlimited lines & stations\n✅ All features unlocked\n✅ No ads',
      [
        { text: 'Maybe Later', style: 'cancel' },
        {
          text: 'Upgrade Now',
          onPress: async () => {
            try {
              const upgradedPrefs = {
                ...userPrefs,
                is_pro: true
              };
              setUserPrefs(upgradedPrefs);
              await AsyncStorage.setItem('user_preferences', JSON.stringify(upgradedPrefs));
              setShowUpgradeBanner(false);
              setShowTrialExpiredModal(false);
              Alert.alert('Welcome to Pro! 🎉', 'All features unlocked. Enjoy unlimited access!');
              console.log('✅ User upgraded to Pro');
            } catch (error) {
              console.error('Error upgrading to Pro:', error);
              Alert.alert('Error', 'Failed to upgrade. Please try again.');
            }
          }
        }
      ]
    );
  };

  // Add a station to dashboard
  const addStation = async (stationId: string) => {
    try {
      // Check if station is already added
      if (userPrefs.saved_stations.includes(stationId)) {
        console.log(`Station ${stationId} already added`);
        return;
      }

      // UNLIMITED ACCESS - NO RESTRICTIONS
      console.log('✅ Adding station - unlimited access granted');

      const updatedPrefs = {
        ...userPrefs,
        saved_stations: [...userPrefs.saved_stations, stationId]
      };
      setUserPrefs(updatedPrefs);
      await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
      console.log(`➕ Added station: ${stationId}`);
    } catch (error) {
      console.error('Error adding station:', error);
    }
  };

  const saveUserPreferences = async (prefs: UserPreferences) => {
    try {
      await AsyncStorage.setItem('user_preferences', JSON.stringify(prefs));
      setUserPrefs(prefs);
    } catch (error) {
      console.error('Error saving preferences:', error);
    }
  };

  const [isFetching, setIsFetching] = useState(false);
  
  /**
   * ✅ ZUSTAND MIGRATION: New fetchDashboardData using Zustand store
   * Step 3: Dashboard now populates central store for all components to use
   */
  const fetchDashboardData = async (prefsOverride?: UserPreferences, forceRefresh = false) => {
    console.log('🚀 ZUSTAND DASHBOARD: fetchDashboardData called', { forceRefresh });
    
    // Force refresh bypasses cache timestamp check
    if (forceRefresh) {
      console.log('🔄 FORCE REFRESH: Bypassing cache');
      lastFetchTime.current = Date.now();
    }
    
    // Use provided prefs or fall back to state (for refresh scenarios)
    const activePrefs = prefsOverride || userPrefs;
    console.log('🔍 Using preferences:', {
      saved_lines: activePrefs.saved_lines,
      saved_stations: activePrefs.saved_stations
    });
    
    try {
      setIsFetching(true);
      setLoading(true);
      
      // ✅ ZUSTAND: Fetch all lines and populate the central store
      console.log('🏪 ZUSTAND: Fetching all lines into central store...');
      await fetchAllLines(forceRefresh);
      console.log('✅ ZUSTAND: Store populated with line data');
      
      // ✅ ZUSTAND: Filter lines from store for dashboard display
      const allLinesArray = Object.values(allLinesFromStore);
      console.log(`🏪 ZUSTAND: Retrieved ${allLinesArray.length} lines from store`);
      
      if (activePrefs.saved_lines.length === 0) {
        setLineStatuses([]);
      } else {
        console.log('⚡ ZUSTAND: Filtering lines for user saved lines:', activePrefs.saved_lines);
        const filteredLines = allLinesArray.filter((line: LineStatus) => 
          activePrefs.saved_lines.includes(line.id)
        );
        console.log('✅ ZUSTAND: Filtered', filteredLines.length, 'lines for dashboard');
        setLineStatuses(filteredLines);
      }

      // Fetch station data for saved stations (stations not yet migrated to Zustand)
      console.log('📍 User saved stations:', activePrefs.saved_stations);
      if (activePrefs.saved_stations.length === 0) {
        setStationData({});
      } else {
        console.log('⚡ BATCH API: Fetching', activePrefs.saved_stations.length, 'stations in single request');
        
        try {
          // Use batch endpoint - single API call for all stations
          const stationIds = activePrefs.saved_stations.join(',');
          const batchUrl = `${BACKEND_URL}/api/stations/batch?ids=${encodeURIComponent(stationIds)}`;
          
          console.log(`📦 BATCH REQUEST: ${batchUrl}`);
          const batchResponse = await fetch(batchUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
          });
          
          if (!batchResponse.ok) {
            throw new Error(`Batch API failed: ${batchResponse.status} ${batchResponse.statusText}`);
          }
          
          const batchData = await batchResponse.json();
          console.log(`✅ BATCH RESPONSE: ${batchData.total_succeeded} succeeded, ${batchData.total_failed} failed`);
          
          // Build station data object from batch response
          const newStationData: { [key: string]: StationData } = {};
          const invalidStationIds: string[] = [];
          
          for (const [stationId, stationInfo] of Object.entries(batchData.stations)) {
            const info = stationInfo as any;
            
            if (info.error) {
              console.warn(`⚠️ Station ${stationId} failed in batch:`, info.message);
              // Mark as invalid if it's a 404 (not found)
              if (info.message && info.message.includes('404')) {
                invalidStationIds.push(stationId);
              }
            } else {
              // Successful station data
              newStationData[stationId] = info as StationData;
              console.log(`✅ Batch loaded: ${info.name}`);
            }
          }
          
          console.log(`✅ BATCH COMPLETE: Loaded ${Object.keys(newStationData).length} stations`);
          setStationData(newStationData);
          
          // Clean up invalid station IDs from user preferences
          if (invalidStationIds.length > 0) {
            console.warn(`🧹 Cleaning up ${invalidStationIds.length} invalid station(s):`, invalidStationIds);
            const cleanedPrefs = {
              ...activePrefs,
              saved_stations: activePrefs.saved_stations.filter(id => !invalidStationIds.includes(id)),
              frozen_stations: (activePrefs.frozen_stations || []).filter(id => !invalidStationIds.includes(id)),
            };
            setUserPrefs(cleanedPrefs);
            await AsyncStorage.setItem('user_preferences', JSON.stringify(cleanedPrefs));
            console.log('✅ Invalid stations removed from preferences');
          }
          
        } catch (error) {
          console.error('❌ BATCH API ERROR:', error);
          // Fallback: if batch fails, show empty stations but don't crash
          setStationData({});
        }
      }
      
      // Clear loading states
      console.log('✅ ZUSTAND DASHBOARD: Data fetch complete');
      setLoading(false);
      setIsFetching(false);
      
    } catch (error) {
      console.error('❌ ZUSTAND DASHBOARD FETCH ERROR:', error);
      setLoading(false);
      setIsFetching(false);
    }
  };

  /**
   * ✅ ZUSTAND MIGRATION: Pull-to-refresh using Zustand store
   */
  const onRefresh = async () => {
    setRefreshing(true);
    console.log('🔄 ZUSTAND: Pull-to-refresh initiated...');
    
    // CRITICAL: Invalidate cache to force fresh data
    lastFetchTime.current = 0;
    
    // ✅ ZUSTAND: Force refresh via store
    await refreshLines(); // This will fetch fresh data into the store
    
    // Re-filter lines for dashboard
    const allLinesArray = Object.values(allLinesFromStore);
    const filteredLines = allLinesArray.filter((line: LineStatus) => 
      userPrefs.saved_lines.includes(line.id)
    );
    setLineStatuses(filteredLines);
    
    // Also refresh station data
    await fetchDashboardData(undefined, true);
    
    setRefreshing(false);
    console.log('✅ ZUSTAND: Pull-to-refresh complete');
  };

  // Moved getStatusColor function below to include severity support

  // NEW: Get worst status across all dashboard items for gradient background
  const getWorstStatus = (): { severity: number; color: string } => {
    let worstSeverity = 0;
    
    console.log('🎨 GRADIENT DEBUG: Checking worst status...');
    console.log('🎨 Saved lines from prefs:', userPrefs.saved_lines);
    console.log('🎨 Frozen lines:', userPrefs.frozen_lines);
    
    // ✅ FIX: Use same data source as UI rendering - check userPrefs.saved_lines and fallback to allLinesFromStore
    const allLinesArray = Object.values(allLinesFromStore);
    console.log('🎨 All lines in store:', allLinesArray.length);
    
    // Check ONLY ACTIVE line statuses (exclude frozen lines)
    userPrefs.saved_lines.forEach(lineId => {
      const isFrozen = isItemFrozen(userPrefs, 'line', lineId);
      
      // Skip frozen lines
      if (isFrozen) {
        console.log(`🎨 ❄️ SKIPPED (frozen): ${lineId}`);
        return;
      }
      
      // Find line data from store (same as UI rendering logic)
      // Skip showing line if store is still loading and has no data yet
      if (isLoadingLines && Object.keys(allLinesFromStore).length === 0) {
        return; // Don't calculate worst status during initial load
      }
      
      const line = lineStatuses.find(l => l.id === lineId) || 
                   allLinesArray.find(l => l.id === lineId) ||
                   { id: lineId, name: lineId + ' Line', color: '#666666', status: 'Unknown', status_severity: 0 };
      
      console.log(`🎨 Line ${line.name}: id="${line.id}", status="${line.status}", severity=${line.status_severity}, frozen=${isFrozen}`);
      
      // Only consider active (non-frozen) lines for gradient
      if (line.status_severity > worstSeverity) {
        console.log(`🎨 ✅ NEW WORST: ${line.name} with severity ${line.status_severity}`);
        worstSeverity = line.status_severity;
      } else {
        console.log(`🎨 ⏭️ SKIPPED (lower severity): ${line.name} (${line.status_severity} <= ${worstSeverity})`);
      }
    });
    
    // Check ONLY ACTIVE station statuses (exclude frozen stations)
    Object.entries(stationData).forEach(([stationId, station]) => {
      const isFrozen = isItemFrozen(userPrefs, 'station', stationId);
      
      // Only consider active (non-frozen) stations
      if (!isFrozen && station.departures && station.departures.length === 0) {
        worstSeverity = Math.max(worstSeverity, 5); // Treat no departures as moderate issue
      }
    });
    
    console.log(`🎨 WORST SEVERITY DETECTED: ${worstSeverity}`);
    
    // Map severity to gradient colors (TfL scale: 0=Good, 3=Minor, 7=Severe, 10=Suspended)
    if (worstSeverity >= 7) {
      console.log('🎨 GRADIENT COLOR: RED (Severe/Suspended)');
      return { severity: worstSeverity, color: '#E32017' }; // Red for severe delays/suspended
    } else if (worstSeverity >= 3) {
      console.log('🎨 GRADIENT COLOR: YELLOW (Minor Delays)');
      return { severity: worstSeverity, color: '#FFD300' }; // Yellow for minor delays
    } else {
      console.log('🎨 GRADIENT COLOR: GREEN (Good Service)');
      return { severity: worstSeverity, color: '#28a745' }; // Green for good service
    }
  };

  // NEW: Generate gradient background based on worst status
  const getGradientBackground = () => {
    const worst = getWorstStatus();
    // Gradient from status color at top to light neutral at bottom
    return `linear-gradient(to bottom, ${worst.color} 0%, rgba(245, 245, 247, 1) 40%)`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Good Service':
        return 'checkmark-circle';
      case 'Minor Delays':
        return 'time';
      case 'Severe Delays':
      case 'Suspended':
        return 'warning';
      case 'Planned Closure':
        return 'close-circle';
      default:
        return 'information-circle';
    }
  };

  const toggleLineInPreferences = (lineId: string) => {
    const isRemoving = userPrefs.saved_lines.includes(lineId);
    const newSavedLines = isRemoving
      ? userPrefs.saved_lines.filter(id => id !== lineId)
      : [...userPrefs.saved_lines, lineId];
    
    // UNLIMITED ACCESS - NO RESTRICTIONS
    console.log('✅ Line modification - unlimited access granted');

    const newPrefs = { ...userPrefs, saved_lines: newSavedLines };
    saveUserPreferences(newPrefs);
    fetchDashboardData(undefined, true); // Force refresh to bypass cache
  };

  const replaceLineInPreferences = (oldLineId: string, newLineId: string) => {
    // Replace the specific line in the saved_lines array
    const newSavedLines = userPrefs.saved_lines.map(id => 
      id === oldLineId ? newLineId : id
    );
    
    const newPrefs = { ...userPrefs, saved_lines: newSavedLines };
    saveUserPreferences(newPrefs);
    fetchDashboardData(undefined, true); // Force refresh to bypass cache
    setExpandedLineCard(null); // Close the dropdown after replacement
  };

  const replaceStationInPreferences = (oldStationId: string, newStationId: string) => {
    console.log('🔄 Replacing station:', oldStationId, '->', newStationId);
    console.log('🔄 Current saved stations:', userPrefs.saved_stations);
    
    // Replace the specific station in the saved_stations array
    const newSavedStations = userPrefs.saved_stations.map(id => 
      id === oldStationId ? newStationId : id
    );
    
    console.log('🔄 New saved stations:', newSavedStations);
    
    const newPrefs = { ...userPrefs, saved_stations: newSavedStations };
    saveUserPreferences(newPrefs);
    fetchDashboardData(undefined, true); // Force refresh to bypass cache
    animateCardClose(oldStationId); // Smooth close animation
  };

  // Animation helpers for smooth card transformations
  const getCardAnimation = (cardId: string) => {
    if (!cardAnimationRefs.current[cardId]) {
      cardAnimationRefs.current[cardId] = new Animated.Value(0);
    }
    return cardAnimationRefs.current[cardId];
  };

  const animateCardExpand = (cardId: string) => {
    const animation = getCardAnimation(cardId);
    Animated.timing(animation, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  };

  const animateCardClose = (cardId: string) => {
    const animation = getCardAnimation(cardId);
    Animated.timing(animation, {
      toValue: 0,
      duration: 250,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start(() => {
      setExpandedStationCard(null);
      setExpandedLineCard(null);
    });
  };

  const toggleStationInPreferences = (stationId: string) => {
    const isRemoving = userPrefs.saved_stations.includes(stationId);
    const newSavedStations = isRemoving
      ? userPrefs.saved_stations.filter(id => id !== stationId)
      : [...userPrefs.saved_stations, stationId];
    
    // UNLIMITED ACCESS - NO RESTRICTIONS
    console.log('✅ Station modification - unlimited access granted');

    const newPrefs = { ...userPrefs, saved_stations: newSavedStations };
    saveUserPreferences(newPrefs);
    fetchDashboardData();
  };

  const searchStations = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/stations/search/${encodeURIComponent(query)}`);
      const results = await response.json();
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching stations:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInput = (text: string) => {
    console.log('🔍 Search input changed:', text);
    setSearchQuery(text);
    
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Only search if there's an expanded card that needs search or station search is active
    if (expandedCard === 'stations' || expandedStationCard !== null) {
      // Immediate response for short queries or empty
      if (text.length <= 1) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      
      // Set searching state immediately for user feedback
      setIsSearching(true);
      
      // Debounce the actual API call by 300ms to reduce lag
      const timeout = setTimeout(() => {
        console.log('🔍 Debounced search executing for:', text);
        searchStations(text);
      }, 300);
      
      setSearchTimeout(timeout);
    }
  };

  // Traffic Light System - Calculate overall commute status
  const getOverallCommuteStatus = (): 'good' | 'minor' | 'severe' => {
    if (lineStatuses.length === 0) return 'good';
    
    const maxSeverity = Math.max(...lineStatuses.map(line => line.status_severity));
    
    if (maxSeverity >= 7) return 'severe';      // Red
    if (maxSeverity >= 3) return 'minor';       // Amber  
    return 'good';                              // Green
  };

  const getStatusColor = (status: string, severity?: number) => {
    if (severity !== undefined) {
      if (severity >= 7) return '#dc3545';      // Red
      if (severity >= 3) return '#ffc107';      // Amber
      return '#28a745';                         // Green
    }
    
    // Fallback to old logic
    switch (status) {
      case 'Good Service':
        return '#28a745';
      case 'Minor Delays':
        return '#ffc107';
      case 'Severe Delays':
      case 'Suspended':
        return '#dc3545';
      case 'Planned Closure':
        return '#6f42c1';
      default:
        return '#6c757d';
    }
  };

  const getHeaderBackgroundColor = (): string => {
    const overallStatus = getOverallCommuteStatus();
    switch (overallStatus) {
      case 'good': return '#28a745';    // Green
      case 'minor': return '#ffc107';   // Amber
      case 'severe': return '#dc3545';  // Red
      default: return '#007AFF';        // Default blue
    }
  };

  const getDashboardBackgroundColor = (): string => {
    const overallStatus = getOverallCommuteStatus();
    switch (overallStatus) {
      case 'good': return 'rgba(40, 167, 69, 0.05)';    // Light green tint
      case 'minor': return 'rgba(255, 193, 7, 0.05)';   // Light amber tint
      case 'severe': return 'rgba(220, 53, 69, 0.05)';  // Light red tint
      default: return '#f8f9fa';                         // Default light gray
    }
  };

  const getTrafficLightColor = (status: string, severity: number): string => {
    if (severity >= 7) return '#dc3545';  // Red
    if (severity >= 3) return '#ffc107';  // Amber
    return '#28a745';                     // Green
  };

  // Memoized render functions to prevent unnecessary re-renders during scroll
  const renderLineItem = useCallback((line: LineStatus, isFrozen: boolean = false) => (
    <View key={line.id}>
      <Animated.View
        style={[
          {
            transform: isEditing ? [
              {
                rotate: jiggleAnim.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: ['-1deg', '0deg', '1deg'],
                }),
              },
            ] : [],
            position: 'relative', // Enable absolute positioning for children
          },
        ]}
      >
        <TouchableOpacity 
          style={[
            styles.lineItem, 
            { 
              borderColor: line.color,
              borderWidth: 3,
            },
            isFrozen && styles.frozenItem
          ]}
          onPress={() => {
            if (!isEditing) {
              // Check if item is frozen - show upgrade modal instead
              if (isFrozen) {
                console.log(`🔒 Frozen item tapped: ${line.name}`);
                setSelectedFrozenItem({ type: 'line', name: line.name });
                setShowFrozenItemModal(true);
                return;
              }
              
              // Navigate to LineDetail screen with line information
              console.log(`🚇 Navigating to line detail: ${line.name} (${line.id})`);
              router.push({
                pathname: '/lineDetail',
                params: {
                  lineId: line.id,
                  lineName: line.name,
                  lineColor: line.color
                }
              });
            }
          }}
          onLongPress={() => {
            if (!isEditing) {
              activateJiggleMode();
            }
          }}
        >
        
        {/* Frozen lock icon overlay */}
        {isFrozen && !isEditing && (
          <View style={styles.frozenOverlay}>
            <Ionicons name="lock-closed" size={24} color="#999" />
          </View>
        )}
        
        {/* iOS-style minus icon positioned absolutely in top-left corner INSIDE the card */}
        {isEditing && (
          <TouchableOpacity
            style={styles.iosMinusButton}
            onPress={(e) => {
              e.stopPropagation(); // Prevent triggering line detail
              removeLine(line.id);
              console.log(`❌ Removed line: ${line.id}`);
            }}
          >
            <Text style={styles.iosMinusButtonText}>⛔️</Text>
          </TouchableOpacity>
        )}
        <View style={styles.lineContent}>
          <Text style={[styles.lineName, isFrozen && styles.frozenText]}>{line.name}</Text>
          <View style={styles.statusRow}>
            <Ionicons
              name={getStatusIcon(line.status) as any}
              size={16}
              color={isFrozen ? '#999' : getStatusColor(line.status, line.status_severity)}
              style={styles.statusIcon}
            />
            <Text style={[
              styles.statusText, 
              { color: isFrozen ? '#999' : getStatusColor(line.status, line.status_severity) }
            ]}>
              {line.status}
            </Text>
          </View>
          {line.reason && (
            <Text style={[styles.reasonText, isFrozen && styles.frozenText]}>{line.reason}</Text>
          )}
        </View>
        
        <View style={styles.lineItemRight}>
          {/* Other line content can go here */}
        </View>
        
        <View style={styles.trafficLight}>
          <View style={[
            styles.trafficLightIndicator, 
            { backgroundColor: isFrozen ? '#ccc' : getTrafficLightColor(line.status, line.status_severity) }
          ]} />
        </View>
        </TouchableOpacity>
      </Animated.View>
      
      {/* Individual line dropdown for replacement */}
      {expandedLineCard === line.id && (
        <View style={styles.individualLineDropdown}>
          <Text style={styles.individualDropdownTitle}>Replace "{line.name}" with:</Text>
          <ScrollView style={styles.individualDropdownScroll} showsVerticalScrollIndicator={true}>
            {Object.values(allLinesFromStore)
              .filter(availableLine => availableLine.id !== line.id) // Don't show current line
              .map((availableLine) => (
                <TouchableOpacity
                  key={availableLine.id}
                  style={[
                    styles.individualDropdownItem,
                    { borderLeftColor: availableLine.color }
                  ]}
                  onPress={() => replaceLineInPreferences(line.id, availableLine.id)}
                >
                  <Text style={styles.individualDropdownLineName}>
                    {availableLine.name}
                  </Text>
                  <View style={styles.individualDropdownStatus}>
                    <Ionicons name="arrow-forward-circle" size={20} color="#007AFF" />
                  </View>
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}
    </View>
  ), [isEditing, jiggleAnim, expandedLineCard, allLinesFromStore, removeLine, replaceLineInPreferences]);

  const renderStationItem = useCallback((stationId: string, isFrozen: boolean = false) => {
    const station = stationData[stationId];
    
    // Debug logging to see why stations show loading
    console.log(`🔍 RENDER DEBUG for ${stationId}:`);
    console.log(`  stationData keys:`, Object.keys(stationData));
    console.log(`  station exists:`, !!station);
    console.log(`  station data:`, station);
    console.log(`  isFrozen:`, isFrozen);

    // Show loading state for stations that haven't loaded yet
    if (!station) {
      return (
        <View style={[styles.stationCard, isFrozen && styles.frozenItem]} key={stationId}>
          <View style={styles.stationMainContent}>
            <View style={styles.stationHeader}>
              <Text style={[styles.stationName, isFrozen && styles.frozenText]}>Loading station...</Text>
              <ActivityIndicator size="small" color={isFrozen ? '#999' : '#666'} />
            </View>
          </View>
        </View>
      );
    }

    // Determine if this station has usable departure data
    const hasLiveDepartures = station.departures && station.departures.length > 0;
    const hasValidName = station.name && station.name !== "Unknown Station";
    const isExpanded = expandedStationCard === stationId;

    return (
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            transform: isEditing ? [
              {
                rotate: jiggleAnim.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: ['-1deg', '0deg', '1deg'],
                }),
              },
            ] : [],
          },
        ]}
      >
        <View 
          key={stationId} 
          style={[
            styles.stationItem, 
            isExpanded && styles.expandedStationCard,
            isFrozen && styles.frozenItem,
          ]}
        >
          {/* Frozen lock icon overlay */}
          {isFrozen && !isEditing && (
            <View style={styles.frozenOverlay}>
              <Ionicons name="lock-closed" size={24} color="#999" />
            </View>
          )}
                    
          {/* When NOT expanded - show normal station info */}
          {!isExpanded ? (
            <TouchableOpacity 
              style={styles.stationMainContent}
              onPress={() => {
                console.log('🔥 Station card clicked!', { isEditing, stationId, stationName: station.name, isFrozen });
                if (!isEditing) {
                  // Check if station is frozen - show upgrade modal instead
                  if (isFrozen) {
                    console.log(`🔒 Frozen station tapped: ${station.name}`);
                    setSelectedFrozenItem({ type: 'station', name: station.name });
                    setShowFrozenItemModal(true);
                    return;
                  }
                  
                  // PRE-FETCH: Start fetching data immediately before navigation
                  console.log(`⚡ PRE-FETCH: Starting API call for ${station.name} (${stationId})`);
                  
                  const fetchPromise = fetch(`${BACKEND_URL}/api/stations/${stationId}`, {
                    method: 'GET',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                  })
                    .then(response => response.json())
                    .then(data => {
                      console.log(`✅ PRE-FETCH COMPLETE: ${data.name} loaded with ${data.departures.length} trains`);
                      return data;
                    })
                    .catch(error => {
                      console.error(`❌ PRE-FETCH ERROR for ${stationId}:`, error);
                      throw error;
                    });
                  
                  // Store the promise in cache for the detail screen to use
                  stationDataCache.set(stationId, fetchPromise);
                  
                  // Navigate immediately while fetch is happening
                  console.log(`🚇 NAVIGATING to station detail: ${station.name} (${stationId})`);
                  try {
                    router.push({
                      pathname: '/stationDetail',
                      params: {
                        stationId: stationId,
                        stationName: station.name
                      }
                    });
                    console.log('✅ Router.push called successfully');
                  } catch (error) {
                    console.error('❌ Navigation error:', error);
                  }
                } else {
                  console.log('⚠️ Navigation blocked - editing mode active');
                }
              }}
              onLongPress={() => {
                if (!isEditing) {
                  activateJiggleMode();
                }
              }}
            >
            
            {/* iOS-style minus icon positioned absolutely in top-left corner INSIDE the station card */}
            {isEditing && (
              <TouchableOpacity
                style={styles.iosMinusButton}
                onPress={(e) => {
                  e.stopPropagation();
                  removeStation(stationId);
                  console.log(`❌ Removed station: ${stationId}`);
                }}
              >
                <Text style={styles.iosMinusButtonText}>⛔️</Text>
              </TouchableOpacity>
            )}
            <View style={styles.stationContent}>
              <View style={styles.stationHeader}>
                <Ionicons 
                  name={hasLiveDepartures ? "train" : "warning"} 
                  size={20} 
                  color={isFrozen ? "#999" : (hasLiveDepartures ? "#007AFF" : "#FF9500")} 
                />
                <Text style={[styles.stationName, isFrozen && styles.frozenText]}>
                  {hasValidName ? station.name : "Station Unavailable"}
                </Text>
              </View>
              
              <View style={styles.departuresContainer}>
                {hasLiveDepartures ? (
                  station.departures.slice(0, 3).map((departure, index) => (
                    <View key={index} style={styles.departureRow}>
                      <Text style={styles.departureLine}>{departure.line}</Text>
                      <Text style={styles.departureDestination} numberOfLines={1}>
                        {departure.destination}
                      </Text>
                      <Text style={styles.departureTime}>{departure.minutes_away} min</Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.noDataContainer}>
                    <Text style={styles.noDeparturesText}>
                      {hasValidName ? "⚠️ Limited or no live data" : "❌ Station data unavailable"}
                    </Text>
                    {hasValidName && (
                      <Text style={styles.suggestNearbyText}>
                        Try searching for nearby stations
                      </Text>
                    )}
                  </View>
                )}
              </View>
            </View>
            
            <View style={styles.stationItemRight}>
              {/* Other station content can go here */}
            </View>
          </TouchableOpacity>
        ) : (
          /* DISABLED - Individual station search mode removed to prevent conflicts with header search */
          <View style={styles.stationItem}>
            <Text style={styles.disabledSearchText}>
              Use the main "ADD" button to search for stations
            </Text>
          </View>
        )}
      </View>
      </Animated.View>
    );
  }, [stationData, isEditing, jiggleAnim, expandedStationCard, router]);

  // Old renderManagementMode function removed - all management happens in jiggle mode with dropdowns

  // Only show loading screen when loading
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading your commute...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Line Detail Screen
  if (selectedLineDetail) {
    const allLinesArray = Object.values(allLinesFromStore);
    const selectedLine = allLinesArray.find(line => line.id === selectedLineDetail) || 
                        lineStatuses.find(line => line.id === selectedLineDetail);
    
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={[styles.header, { backgroundColor: selectedLine?.color || '#007AFF' }]}>
          <TouchableOpacity onPress={() => setSelectedLineDetail(null)}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{selectedLine?.name || 'Line Detail'}</Text>
          <View style={{ width: 24 }} />
        </View>
        
        <ScrollView style={styles.content}>
          <View style={styles.lineDetailContainer}>
            <View style={styles.lineStatusCard}>
              <Text style={styles.lineDetailTitle}>Current Status</Text>
              <View style={styles.statusRow}>
                <Ionicons
                  name={getStatusIcon(selectedLine?.status || 'Good Service') as any}
                  size={24}
                  color={getStatusColor(selectedLine?.status || 'Good Service', selectedLine?.status_severity)}
                />
                <Text style={[styles.lineDetailStatus, { 
                  color: getStatusColor(selectedLine?.status || 'Good Service', selectedLine?.status_severity) 
                }]}>
                  {selectedLine?.status || 'Good Service'}
                </Text>
              </View>
              {selectedLine?.reason && (
                <Text style={styles.lineDetailReason}>{selectedLine.reason}</Text>
              )}
            </View>
            
            <View style={styles.lineMapCard}>
              <Text style={styles.lineDetailTitle}>Line Map</Text>
              <View style={styles.mapPlaceholder}>
                <Ionicons name="map" size={48} color="#666" />
                <Text style={styles.mapPlaceholderText}>
                  Interactive line map coming soon
                </Text>
              </View>
            </View>
            
            <View style={styles.engineeringWorksCard}>
              <Text style={styles.lineDetailTitle}>Planned Works</Text>
              <Text style={styles.engineeringWorksText}>
                No planned engineering works this weekend.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Old setupMode removed - all management happens in jiggle mode

  // Handle Add/Manage Modal save
  const handleAddManageSave = async (lines: string[], stations: string[]) => {
    console.log('💾 Saving from Add/Manage modal:', { lines, stations });
    
    const newPrefs = {
      ...userPrefs,
      saved_lines: lines,
      saved_stations: stations
    };
    
    setUserPrefs(newPrefs);
    await AsyncStorage.setItem('user_preferences', JSON.stringify(newPrefs));
    
    // Reload data for any new items using the correct function
    setRefreshing(true);
    await fetchDashboardData(undefined, true); // Force refresh to bypass cache
    setRefreshing(false);
    
    console.log('✅ Add/Manage changes saved successfully');
  };

  return (
    <LinearGradient
      colors={[getWorstStatus().color, 'rgba(245, 245, 247, 1)']}
      locations={[0, 0.4]}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" />
      
      {/* Header with My Commute Logo - Transparent to show gradient */}
      <View style={[styles.header, { backgroundColor: 'transparent' }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <View style={styles.titleRow}>
              <Text style={styles.myCommuteTitleWhite}>MY COMMUTE</Text>
              <Text style={styles.itemCounterWhite}> • {getItemCounterText(userPrefs)}</Text>
            </View>
            {/* ✅ PHASE 1: Trial badge removed from header - status now only in Settings */}
          </View>
          
          <View style={styles.headerRight}>
            {!isEditing ? (
              <TouchableOpacity 
                style={[
                  styles.headerIconButton,
                  !canAddMoreItems(userPrefs) && styles.headerIconButtonDisabled
                ]}
                onPress={() => {
                  if (!canAddMoreItems(userPrefs)) {
                    Alert.alert(
                      'Item Limit Reached',
                      'Free tier includes 3 items total. Upgrade to Pro for unlimited access.',
                      [
                        { text: 'Maybe Later', style: 'cancel' },
                        { text: 'Upgrade to Pro', onPress: handleUpgradeToPro }
                      ]
                    );
                  } else {
                    setShowAddManageModal(true);
                  }
                }}
              >
                <Ionicons 
                  name="add" 
                  size={24} 
                  color={!canAddMoreItems(userPrefs) ? '#999' : '#FFFFFF'} 
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={styles.headerDoneButton}
                onPress={deactivateJiggleMode}
              >
                <Text style={styles.headerDoneButtonText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Phase 2: Upgrade Banner for Expired Trial */}
      {/* ✅ FIX: Don't show banner if modal is currently visible */}
      {showUpgradeBanner && shouldShowUpgradeBanner(userPrefs) && !showTrialExpiredModal && (
        <TouchableOpacity 
          style={styles.upgradeBanner}
          onPress={handleUpgradeToPro}
        >
          <View style={styles.upgradeBannerContent}>
            <Ionicons name="star" size={20} color="#FFFFFF" />
            <Text style={styles.upgradeBannerText}>
              Your Pro trial has ended. Upgrade to Pro for life with a single £7.99 purchase.
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.bannerDismissButton}
            onPress={(e) => {
              e.stopPropagation();
              setShowUpgradeBanner(false);
              setUpgradeBannerDismissedThisSession(true); // Dismiss for entire session
            }}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Dashboard Content */}
      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={1}
        onPress={() => {
          if (isEditing) {
            deactivateJiggleMode();
          }
        }}
      >
        <KeyboardAvoidingView 
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'position'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -150}
          enabled={true}
        >
          <ScrollView
            ref={scrollViewRef}
            style={[styles.content, { backgroundColor: getDashboardBackgroundColor() }]}
            contentContainerStyle={{ 
              paddingBottom: isKeyboardVisible ? keyboardHeight + 20 : 0,
              flexGrow: 1 
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
        {/* Welcome Message */}
        {userPrefs.saved_lines.length === 0 && userPrefs.saved_stations.length === 0 && (
          <View style={styles.welcomeContainer}>
            <Ionicons name="train" size={48} color="#007AFF" />
            <Text style={styles.welcomeTitle}>Welcome to My Commute!</Text>
            <Text style={styles.welcomeText}>
              Your personal London commute dashboard. Tap the settings icon to add your lines and stations.
            </Text>
            <TouchableOpacity
              style={styles.getStartedButton}
              onPress={() => {
                // Simply expand the lines search to show all available options
                setExpandedCard('lines');
              }}
            >
              <Text style={styles.getStartedText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Lines Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.brandedSectionTitle}>My Lines</Text>
            {/* ADD button removed - now using unified Add/Manage modal from header */}
          </View>
          
          {/* Only show lines that are actually in userPrefs.saved_lines */}
          {userPrefs.saved_lines.length > 0 ? (
            userPrefs.saved_lines
              // ✅ Sort so active lines appear first, frozen lines at bottom
              .sort((a, b) => {
                const aFrozen = isItemFrozen(userPrefs, 'line', a);
                const bFrozen = isItemFrozen(userPrefs, 'line', b);
                // Active items (not frozen) come first
                if (aFrozen && !bFrozen) return 1;  // a is frozen, b is active → b comes first
                if (!aFrozen && bFrozen) return -1; // a is active, b is frozen → a comes first
                return 0; // Both same status, keep original order
              })
              .map((lineId) => {
                const allLinesArray = Object.values(allLinesFromStore);
                
                // ✅ FIX: Don't render with "Unknown" during initial load
                // Wait for store to have data before showing lines
                if (isLoadingLines && allLinesArray.length === 0) {
                  return null; // Skip rendering during initial load
                }
                
                const line = lineStatuses.find(l => l.id === lineId) || 
                            allLinesArray.find(l => l.id === lineId) ||
                            { id: lineId, name: lineId + ' Line', color: '#666666', status: 'Unknown', status_severity: 0 };
                const isFrozen = isItemFrozen(userPrefs, 'line', lineId);
                return renderLineItem(line, isFrozen);
              })
          ) : (
            <View style={styles.emptySection}>
              <Text style={styles.emptyStateText}>No lines added yet. Tap Search to add lines.</Text>
            </View>
          )}
          
          {/* Individual line dropdowns are now rendered within each line item */}
          
          {/* Lines Dropdown removed - now using unified Add/Manage modal */}
          
        </View>

        {/* Stations Section - Simplified */}
        <View 
          ref={stationsSectionRef} 
          key={`stations_${Object.keys(stationData).length}`}
          style={styles.section}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.brandedSectionTitle}>Your Stations</Text>
          </View>

            {/* Show stations */}
            {userPrefs.saved_stations.length > 0 ? (
              userPrefs.saved_stations
                .filter(stationId => {
                  const isValidId = stationId && stationId.trim() !== '';
                  const hasStationData = stationData[stationId];
                  console.log(`🔍 Station filter check: ${stationId}, valid: ${isValidId}, hasData: ${!!hasStationData}`);
                  return isValidId; // Remove stationData requirement - render all valid station IDs
                })
                // ✅ Sort so active stations appear first, frozen stations at bottom
                .sort((a, b) => {
                  const aFrozen = isItemFrozen(userPrefs, 'station', a);
                  const bFrozen = isItemFrozen(userPrefs, 'station', b);
                  // Active items (not frozen) come first
                  if (aFrozen && !bFrozen) return 1;  // a is frozen, b is active → b comes first
                  if (!aFrozen && bFrozen) return -1; // a is active, b is frozen → a comes first
                  return 0; // Both same status, keep original order
                })
                .map((stationId, index) => {
                  console.log(`📍 Rendering station: ${stationId}`);
                  const isFrozen = isItemFrozen(userPrefs, 'station', stationId);
                  return (
                    <View key={`${stationId}_${Object.keys(stationData).length}_${index}`}>
                      {renderStationItem(stationId, isFrozen)}
                    </View>
                  );
                })
            ) : (
              <View style={styles.emptySection}>
                <Text style={styles.emptyStateText}>No stations added yet. Long-press any card to edit.</Text>
              </View>
            )}
          </View>

        {/* Footer and promotional content completely removed */}
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableOpacity>

      {/* Add/Manage Modal */}
      <AddManageModal 
        visible={showAddManageModal}
        onClose={() => {
          setShowAddManageModal(false);
          // Invalidate cache so dashboard refreshes with latest data
          lastFetchTime.current = 0;
          console.log('🔄 Add modal closed - cache invalidated, will refresh on focus');
        }}
        savedLines={userPrefs.saved_lines}
        savedStations={userPrefs.saved_stations}
        onSave={handleAddManageSave}
      />

      {/* WELCOME MODAL - First Launch */}
      {showWelcomeModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.welcomeModal}>
            <Ionicons name="rocket" size={64} color="#007AFF" />
            <Text style={styles.welcomeModalTitle}>Welcome to My Commute! 🎉</Text>
            
            <Text style={styles.welcomeModalText}>
              Your <Text style={styles.welcomeHighlight}>45-day all-access Pro trial</Text> starts now.
            </Text>
            
            <Text style={styles.welcomeModalSubtext}>
              Enjoy unlimited lines, stations, and journeys while you discover the perfect commute setup.
            </Text>
            
            <TouchableOpacity 
              style={styles.welcomeGetStartedButton}
              onPress={async () => {
                setShowWelcomeModal(false);
                const updatedPrefs = { ...userPrefs, welcome_modal_shown: true };
                await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
                setUserPrefs(updatedPrefs);
              }}
            >
              <Text style={styles.welcomeGetStartedText}>Get Started</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 7-DAY WARNING BANNER */}
      {showSevenDayWarning && (
        <View style={styles.sevenDayWarningBanner}>
          <View style={styles.warningContent}>
            <Ionicons name="time" size={24} color="#FFA000" />
            <View style={styles.warningTextContainer}>
              <Text style={styles.warningTitle}>
                Your Pro trial ends in {userPrefs.trial_start_date ? getTrialDaysRemaining(userPrefs.trial_start_date) : 0} days
              </Text>
              <Text style={styles.warningSubtext}>
                Upgrade now for £7.99 (one-time) to keep unlimited access
              </Text>
            </View>
          </View>
          <View style={styles.warningActions}>
            <TouchableOpacity 
              style={styles.upgradeNowButton}
              onPress={handleUpgradeToPro}
            >
              <Text style={styles.upgradeNowButtonText}>Upgrade to Pro</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.remindLaterButton}
              onPress={async () => {
                setShowSevenDayWarning(false);
                const updatedPrefs = { ...userPrefs, seven_day_warning_dismissed: true };
                await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
                setUserPrefs(updatedPrefs);
              }}
            >
              <Text style={styles.remindLaterButtonText}>Remind Me Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* IN-TRIAL FEATURE PROMPT */}
      {/* ✅ CRITICAL FIX: Only show Pro Tip if NOT in urgent 7-day period (even if warning is dismissed) */}
      {showInTrialPrompt && 
       !showSevenDayWarning && 
       userPrefs.trial_start_date && 
       getTrialDaysRemaining(userPrefs.trial_start_date) > 7 && (
        <View style={styles.inTrialPromptBanner}>
          <Ionicons name="bulb" size={32} color="#007AFF" />
          <View style={styles.promptTextContainer}>
            <Text style={styles.promptTitle}>💡 Pro Tip: You're on a Pro trial!</Text>
            <Text style={styles.promptText}>
              Why not add more lines or stations to perfect your setup?
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.promptCloseButton}
            onPress={async () => {
              setShowInTrialPrompt(false);
              const updatedPrefs = { ...userPrefs, in_trial_prompt_shown: true };
              await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
              setUserPrefs(updatedPrefs);
            }}
          >
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>
      )}

      {/* FROZEN ITEM UNLOCK MODAL */}
      {showFrozenItemModal && selectedFrozenItem && (
        <View style={styles.modalOverlay}>
          <View style={styles.frozenItemModal}>
            <Ionicons name="lock-closed" size={64} color="#FFA000" />
            
            <Text style={styles.frozenModalTitle}>Unlock This Item with Pro</Text>
            
            <Text style={styles.frozenModalBody}>
              The <Text style={styles.frozenItemName}>{selectedFrozenItem.name}</Text> was saved during your Pro trial and is now frozen. 
              Upgrade to unlock all your saved items <Text style={styles.foreverText}>forever</Text>.
            </Text>
            
            <View style={styles.valuePropositionRow}>
              <Ionicons name="star" size={20} color="#007AFF" />
              <Text style={styles.valuePropositionText}>
                Pay once, own it forever. Just £7.99.
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.upgradeForLifeButton}
              onPress={() => {
                setShowFrozenItemModal(false);
                handleUpgradeToPro();
              }}
            >
              <Text style={styles.upgradeForLifeButtonText}>Upgrade for Life - £7.99</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.notNowButton}
              onPress={() => {
                setShowFrozenItemModal(false);
                setSelectedFrozenItem(null);
              }}
            >
              <Text style={styles.notNowButtonText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Phase 2: Trial Expired Modal - Cross-platform compatible */}
      {showTrialExpiredModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.trialExpiredModal}>
            <Text style={styles.trialExpiredTitle}>Your 45-Day Trial Has Ended</Text>
            
            <View style={styles.trialExpiredContent}>
              <Text style={styles.trialExpiredText}>During your trial, you added:</Text>
              <View style={styles.trialStatsRow}>
                <Ionicons name="subway" size={20} color="#007AFF" />
                <Text style={styles.trialStatsText}>{userPrefs.saved_lines.length} lines</Text>
              </View>
              <View style={styles.trialStatsRow}>
                <Ionicons name="location" size={20} color="#007AFF" />
                <Text style={styles.trialStatsText}>{userPrefs.saved_stations.length} stations</Text>
              </View>
              
              <Text style={styles.trialExpiredSubtext}>
                Free tier includes 3 items total.{'\n'}
                Keep any 3 or upgrade for unlimited.
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.upgradeButton}
              onPress={() => {
                setShowTrialExpiredModal(false);
                handleUpgradeToPro();
              }}
            >
              <Text style={styles.upgradeButtonText}>Upgrade to Pro - One-time Payment</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.continueFreeButton}
              onPress={async () => {
                setShowTrialExpiredModal(false);
                // ✅ FIX: Don't show banner - user already dealt with trial expiry via modal
                // Save that modal was shown so it doesn't appear again
                const updatedPrefs = {
                  ...userPrefs,
                  trial_expired_modal_shown: true,
                };
                await AsyncStorage.setItem('user_preferences', JSON.stringify(updatedPrefs));
                setUserPrefs(updatedPrefs);
              }}
            >
              <Text style={styles.continueFreeButtonText}>Continue with Free (3 items)</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50, // Minimal top padding for status bar
    paddingBottom: 12,
    // backgroundColor removed to show gradient through
    borderBottomWidth: 0, // Remove border for cleaner gradient flow
    borderBottomColor: 'transparent',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Centered My Commute Logo Styles
  // Removed centeredLogoContainer - now using headerLeft/headerRight layout
  myCommuteTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 2,
    textAlign: 'center',
  },
  myCommuteTitleWhite: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  itemCounterWhite: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Traffic Light Styles
  trafficLight: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  trafficLightIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  content: {
    flex: 1,
  },
  welcomeContainer: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  getStartedButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  getStartedText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    margin: 16,
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  lineItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative', // Enable absolute positioning for children
  },
  lineIndicator: {
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  lineContent: {
    flex: 1,
    padding: 16,
  },
  lineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  reasonText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  stationItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  departuresContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  departureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  departureLine: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
    width: 60,
  },
  departureDestination: {
    fontSize: 14,
    color: '#333',
    flex: 1,
    marginHorizontal: 8,
  },
  departureTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    padding: 8,
  },
  // Management Interface Styles
  managementContainer: {
    flex: 1,
  },
  managementContent: {
    flex: 1,
    padding: 16,
  },
  managementHeader: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  managementTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  managementTabActive: {
    backgroundColor: '#007AFF',
  },
  managementTabText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  managementTabTextActive: {
    color: '#fff',
  },
  currentItemsSection: {
    marginBottom: 32,
  },
  currentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  currentItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    marginLeft: 12,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  addItemsSection: {
    marginBottom: 32,
  },
  searchContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingRight: 50,
  },
  searchSpinner: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -10,
  },
  addableItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  addableItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  addableItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 2,
  },
  addableItemStatus: {
    fontSize: 14,
    color: '#666',
  },
  noResultsText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic',
  },
  helpText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    padding: 20,
    lineHeight: 24,
  },
  doneButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  headerDoneButton: {
    position: 'absolute',
    right: 20,
    top: '50%',
    marginTop: -16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  headerDoneButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  headerIconButton: {
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Line Detail Screen Styles
  lineDetailContainer: {
    padding: 16,
  },
  lineStatusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lineDetailTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  lineDetailStatus: {
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 8,
  },
  lineDetailReason: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    lineHeight: 20,
  },
  lineMapCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  mapPlaceholderText: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  engineeringWorksCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  engineeringWorksText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addButton: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    borderWidth: 1,
    borderColor: '#007AFF',
    minWidth: 80,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  removeButton: {
    padding: 8,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderWidth: 1,
    borderColor: '#FF6B6B',
    minWidth: 30,
    minHeight: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 16,
  },
  iosMinusButton: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FF3B30',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  iosMinusButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  // Phase 2: Trial Indicator Styles
  trialIndicator: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },

  // Phase 2: Upgrade Banner Styles
  upgradeBanner: {
    backgroundColor: '#FF6B35',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  upgradeBannerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  upgradeBannerArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Footer styles removed - no more promotional content
  // Collapsible Section Styles
  collapsibleSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  expandedEditor: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
    maxHeight: 300,
  },
  editorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  editorScrollView: {
    maxHeight: 200,
  },
  editorLineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#ddd',
  },
  editorLineName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  editorStationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
  },
  editorStationName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    marginLeft: 8,
  },
  addCheckbox: {
    marginLeft: 8,
  },
  removeCheckbox: {
    marginLeft: 8,
  },
  selectedLineItem: {
    backgroundColor: '#f8f4f4',
    borderWidth: 1,
    borderColor: '#ff4757',
  },
  editorSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 12,
  },
  removeIcon: {
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapToRemoveText: {
    fontSize: 12,
    color: '#ff4757',
    marginLeft: 'auto',
    fontWeight: '500',
  },
  disabledLineItem: {
    opacity: 0.5,
    backgroundColor: '#f8f8f8',
  },
  disabledText: {
    color: '#999',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    padding: 16,
    fontStyle: 'italic',
  },
  stationSearchInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 12,
  },
  searchHelpText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic',
  },
  // New Search Button and Dropdown Styles
  sectionHeaderWithSearch: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  searchIcon: {
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchEmoji: {
    fontSize: 20,
  },
  dropdownSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  emptySection: {
    padding: 20,
    alignItems: 'center',
  },
  linesDropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownScrollView: {
    maxHeight: 280,
  },
  dropdownLineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
    borderLeftWidth: 4,
    borderLeftColor: '#ddd',
  },
  selectedDropdownItem: {
    backgroundColor: '#f0f8ff',
  },
  disabledDropdownItem: {
    opacity: 0.5,
  },
  dropdownLineName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  dropdownStatus: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  closeDropdownButton: {
    backgroundColor: '#007AFF',
    margin: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeDropdownText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Professional Typography
  brandedSectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
    letterSpacing: -0.5,
  },

  // Individual Line Card Search Styles
  lineItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  individualSearchIcon: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  searchEmoji: {
    fontSize: 16,
  },
  individualLineDropdown: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    maxHeight: 200,
  },
  individualDropdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  individualDropdownScroll: {
    maxHeight: 150,
  },
  individualDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 10,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#ddd',
  },
  individualDropdownLineName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  individualDropdownStatus: {
    marginLeft: 8,
  },

  // Individual Station Card Styles
  stationContent: {
    flex: 1,
  },
  stationItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  individualStationDropdown: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 8,
    padding: 12,
    maxHeight: 250,
  },
  stationSearchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  noResultsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    padding: 16,
  },
  searchHelpText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    padding: 8,
  },

  // Card Transformation UI Styles - Search INSIDE the card
  stationMainContent: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative', // Enable absolute positioning for children
  },
  expandedStationCard: {
    backgroundColor: '#f8f9fa', // Different background when expanded
  },
  activeSearchIcon: {
    backgroundColor: '#007AFF',
  },
  inCardSearchInterface: {
    backgroundColor: '#f0f4f8',
    overflow: 'hidden',
  },
  searchDivider: {
    height: 1,
    backgroundColor: '#007AFF',
    marginHorizontal: 12,
    marginVertical: 8,
  },
  searchContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  expandedSearchInterface: {
    padding: 16,
  },
  replaceStationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  searchResultsContainer: {
    maxHeight: 200,
    marginBottom: 12,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  searchResultName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    marginLeft: 8,
  },
  replaceActionIcon: {
    paddingLeft: 8,
  },
  noResultsContainer: {
    alignItems: 'center',
    padding: 24,
  },
  noResultsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  searchSuggestionText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 4,
  },
  searchPromptContainer: {
    alignItems: 'center',
    padding: 24,
  },
  searchPromptText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#007AFF',
    textAlign: 'center',
    marginTop: 8,
  },
  searchExamplesText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  searchingContainer: {
    alignItems: 'center',
    padding: 16,
  },
  searchingText: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  closeSearchButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  closeSearchText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  noDeparturesText: {
    fontSize: 12,
    color: '#FF9500',
    fontWeight: '600',
    paddingVertical: 4,
  },
  noDataContainer: {
    paddingVertical: 4,
  },
  suggestNearbyText: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Enhanced Card Transformation & Keyboard Management Styles
  keyboardAvoidingContainer: {
    flex: 1,
  },
  searchInputFocused: {
    borderColor: '#007AFF',
    borderWidth: 2,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  searchResultsWithKeyboard: {
    maxHeight: 160, // Reduced height when keyboard is visible
  },
  closeButtonWithKeyboard: {
    marginTop: 8,
    backgroundColor: '#34C759', // Green when keyboard is active
  },

  // Search Mode - Card Becomes Search Interface
  searchModeCard: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  searchModeInput: {
    flex: 1,
    fontSize: 16,
    marginHorizontal: 8,
    color: '#333',
  },
  searchModeCloseButton: {
    padding: 4,
  },
  searchModeResults: {
    flex: 1,
    maxHeight: 200,
  },
  
  // Lines Dropdown Styles
  dropdownContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
    maxHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  lineDropdown: {
    maxHeight: 350,
  },
  dropdownTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    padding: 16,
    paddingBottom: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  dropdownItemStatus: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  // Station Search Styles
  stationSearchContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
    maxHeight: 300,
  },
  stationSearchInput: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 12,
  },
  stationSearchResults: {
    maxHeight: 200,
  },
  stationSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  stationSearchItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  
  // In-Place Search Interface Styles
  inPlaceSearchContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 16,
    flex: 1,
  },
  inPlaceSearchInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flex: 1,
    marginRight: 12,
  },

  cancelButton: {
    backgroundColor: '#6c757d',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  searchHintContainer: {
    padding: 16,
    alignItems: 'center',
  },

  searchResultsContainer: {
    maxHeight: 200,
    backgroundColor: '#fff',
  },

  stationSearchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  stationSearchItemText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },

  searchHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },

  noResultsText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  searchResults: {
    maxHeight: 200,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchResultName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
  },
  searchResultType: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#e9ecef',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  searchHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    padding: 16,
    fontStyle: 'italic',
  },
  noResults: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 40,
    fontStyle: 'italic',
  },
  // Phase 2: Upgrade Banner Styles
  upgradeBanner: {
    backgroundColor: '#FF6B35',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  upgradeBannerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  upgradeBannerArrow: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  trialIndicator: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  // Phase 2: Trial System Styles
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemCounter: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  trialBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  trialBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  upgradeBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  bannerDismissButton: {
    padding: 4,
  },
  headerIconButtonDisabled: {
    opacity: 0.5,
  },
  // Modal Overlay and Trial Expired Modal
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  trialExpiredModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  trialExpiredTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  trialExpiredContent: {
    marginVertical: 16,
  },
  trialExpiredText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
  },
  trialStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    gap: 8,
  },
  trialStatsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  trialExpiredSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 20,
  },
  upgradeButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  upgradeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  continueFreeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  continueFreeButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Frozen Item Styles
  frozenItem: {
    opacity: 0.5,
    backgroundColor: '#f5f5f5',
  },
  frozenText: {
    color: '#999',
  },
  frozenOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 20,
    padding: 6,
  },
  // NEW: Welcome Modal Styles
  welcomeModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    margin: 20,
    alignItems: 'center',
    maxWidth: 400,
  },
  welcomeModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  welcomeModalText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  welcomeHighlight: {
    fontWeight: '700',
    color: '#007AFF',
  },
  welcomeModalSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  welcomeGetStartedButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    width: '100%',
  },
  welcomeGetStartedText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  // NEW: 7-Day Warning Banner Styles
  sevenDayWarningBanner: {
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 4,
    borderLeftColor: '#FFA000',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  warningTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#856404',
    marginBottom: 4,
  },
  warningSubtext: {
    fontSize: 14,
    color: '#856404',
  },
  warningActions: {
    flexDirection: 'row',
    gap: 8,
  },
  upgradeNowButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  upgradeNowButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  remindLaterButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#856404',
  },
  remindLaterButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#856404',
  },
  // NEW: In-Trial Prompt Banner Styles
  inTrialPromptBanner: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  promptTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  promptTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0D47A1',
    marginBottom: 4,
  },
  promptText: {
    fontSize: 14,
    color: '#1565C0',
  },
  promptCloseButton: {
    padding: 8,
    marginLeft: 8,
  },
  // Frozen Item Unlock Modal Styles
  frozenItemModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    margin: 20,
    alignItems: 'center',
    maxWidth: 400,
  },
  frozenModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginTop: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  frozenModalBody: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  frozenItemName: {
    fontWeight: '700',
    color: '#333',
  },
  foreverText: {
    fontWeight: '700',
    color: '#007AFF',
  },
  valuePropositionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 24,
    gap: 8,
  },
  valuePropositionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  upgradeForLifeButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    marginBottom: 12,
  },
  upgradeForLifeButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  notNowButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  notNowButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#999',
    textAlign: 'center',
  },
});

// Update line item to remove old line indicator and use new border design
const updatedLineItemStyle = {
  ...StyleSheet.create({
    lineItem: {
      flexDirection: 'row',
      backgroundColor: '#fff',
      borderRadius: 12,
      marginBottom: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
      paddingVertical: 16,
      paddingHorizontal: 16,
    },
  }).lineItem,
};
