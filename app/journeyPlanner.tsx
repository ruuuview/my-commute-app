import { APP_CONFIG } from '../config/app.config';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

// ✅ Use Config
const BACKEND_URL = APP_CONFIG.BACKEND_URL;

// Types
interface StationSearchResult {
  id: string;
  name: string;
}

interface JourneyLeg {
  mode: string;
  line_name: string | null;
  line_color: string | null;
  from_station: string;
  to_station: string;
  duration: number;
  distance: number | null;
  instruction: string;
  departure_time: string | null;
  arrival_time: string | null;
  direction: string | null;
  num_stops: number | null;
  platform: string | null;
}

interface AlternativeTime {
  start_time: string;
  end_time: string;
  duration: number;
}

interface JourneyOption {
  duration: number;
  legs: JourneyLeg[];
  start_time: string;
  end_time: string;
  changes: number;
  alternative_times?: AlternativeTime[];
}

export default function JourneyPlannerV2() {
  const router = useRouter();
  
  // State
  const [fromStation, setFromStation] = useState<StationSearchResult | null>(null);
  const [toStation, setToStation] = useState<StationSearchResult | null>(null);
  const [fromSearchText, setFromSearchText] = useState('');
  const [toSearchText, setToSearchText] = useState('');
  const [fromSearchResults, setFromSearchResults] = useState<StationSearchResult[]>([]);
  const [toSearchResults, setToSearchResults] = useState<StationSearchResult[]>([]);
  const [isSearchingFrom, setIsSearchingFrom] = useState(false);
  const [isSearchingTo, setIsSearchingTo] = useState(false);
  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [stepFreeOnly, setStepFreeOnly] = useState(false);
  const [journeyResults, setJourneyResults] = useState<JourneyOption[]>([]);
  const [isLoadingJourney, setIsLoadingJourney] = useState(false);
  const [expandedJourney, setExpandedJourney] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Time selection state
  const [departureTime, setDepartureTime] = useState<Date | null>(null);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Search stations
  const searchStations = async (query: string, isFrom: boolean) => {
    if (query.length < 2) {
      if (isFrom) setFromSearchResults([]);
      else setToSearchResults([]);
      return;
    }

    try {
      if (isFrom) setIsSearchingFrom(true);
      else setIsSearchingTo(true);

      const response = await fetch(
        `${BACKEND_URL}/api/stations/search/${encodeURIComponent(query)}`,
        {
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (isFrom) setFromSearchResults(data);
        else setToSearchResults(data);
      }
    } catch (error) {
      console.error('Station search error:', error);
    } finally {
      if (isFrom) setIsSearchingFrom(false);
      else setIsSearchingTo(false);
    }
  };

  // Plan journey
  const planJourney = async () => {
    if (!fromStation || !toStation) {
      setErrorMessage('Please select both From and To stations');
      return;
    }

    if (fromStation.id === toStation.id) {
      setErrorMessage('From and To stations must be different');
      return;
    }

    setIsLoadingJourney(true);
    setErrorMessage('');
    setJourneyResults([]);

    try {
      const requestBody: any = {
        from_station: fromStation.id,
        to_station: toStation.id,
        step_free: stepFreeOnly,
      };

      // Add time parameters if selected
      if (departureTime) {
        requestBody.time = departureTime.toISOString();
        requestBody.time_is_arrival = false; // Always departing
      }

      const response = await fetch(`${BACKEND_URL}/api/journey-planner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.journeys && data.journeys.length > 0) {
          setJourneyResults(data.journeys);
          // Auto-expand first journey
          setExpandedJourney(0);
        } else {
          setErrorMessage('No journey options found. Try different stations.');
        }
      } else {
        const errorData = await response.json();
        
        if (response.status === 429) {
          setErrorMessage('TfL API is busy. Please wait 15 seconds and try again.');
        } else if (response.status === 300) {
          setErrorMessage('Station names are ambiguous. Please select more specific stations.');
        } else {
          setErrorMessage(errorData.detail || 'Failed to plan journey. Please try again.');
        }
      }
    } catch (error) {
      console.error('Journey planning error:', error);
      setErrorMessage('Network error. Please check your connection and try again.');
    } finally {
      setIsLoadingJourney(false);
    }
  };

  // Swap stations
  const swapStations = () => {
    const tempStation = fromStation;
    const tempText = fromSearchText;
    setFromStation(toStation);
    setFromSearchText(toSearchText);
    setToStation(tempStation);
    setToSearchText(tempText);
  };

  // Format duration
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Format time
  const formatTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  // Get mode icon
  const getModeIcon = (mode: string): string => {
    const modeLower = String(mode ?? '').toLowerCase();
    if (modeLower.includes('tube') || modeLower.includes('underground')) return 'train';
    if (modeLower.includes('bus')) return 'bus';
    if (modeLower.includes('walk')) return 'walk';
    if (modeLower.includes('cycle')) return 'bicycle';
    if (modeLower.includes('overground')) return 'train-outline';
    if (modeLower.includes('dlr')) return 'train-outline';
    if (modeLower.includes('elizabeth')) return 'train-outline';
    return 'arrow-forward';
  };

  // Open maps app for walking directions
  const openMapsForWalking = (destinationStation: string) => {
    const destination = encodeURIComponent(destinationStation);
    
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${destination}&dirflg=w`,
      android: `google.navigation:q=${destination}&mode=w`,
    });

    if (url) {
      Linking.canOpenURL(url).then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`;
          Linking.openURL(fallbackUrl);
        }
      });
    }
  };

  // Clear time selection
  const clearDepartureTime = () => {
    setDepartureTime(null);
  };

  // Render station search modal
  const renderSearchModal = (
    visible: boolean,
    onClose: () => void,
    searchText: string,
    setSearchText: (text: string) => void,
    results: StationSearchResult[],
    isSearching: boolean,
    onSelect: (station: StationSearchResult) => void,
    title: string
  ) => (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
            <Ionicons name="close" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search for a station..."
            value={searchText}
            onChangeText={(text) => {
              setSearchText(text);
              searchStations(text, title === 'From');
            }}
            autoFocus
            autoCapitalize="words"
          />
          {searchText.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchText('');
                if (title === 'From') setFromSearchResults([]);
                else setToSearchResults([]);
              }}
            >
              <Ionicons name="close-circle" size={20} color="#999" />
            </TouchableOpacity>
          )}
        </View>

        {isSearching ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchResultItem}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Ionicons name="location" size={24} color="#007AFF" />
                <Text style={styles.searchResultText}>{item.name}</Text>
                <Ionicons name="chevron-forward" size={20} color="#999" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              searchText.length >= 2 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No stations found</Text>
                  <Text style={styles.emptySubtext}>Try a different search term</Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <Ionicons name="search" size={48} color="#CCC" />
                  <Text style={styles.emptyText}>Start typing to search</Text>
                  <Text style={styles.emptySubtext}>Enter at least 2 characters</Text>
                </View>
              )
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );

  // Render journey leg with enhanced details
  const renderJourneyLeg = (leg: JourneyLeg, index: number, totalLegs: number, isFirst: boolean) => {
    const legMode = String(leg.mode ?? '');
    const isWalking = legMode.toLowerCase().includes('walk');
    const isCycling = legMode.toLowerCase().includes('cycle');
    const walkDuration = leg.duration;
    const shouldShowMapButton = (isWalking || isCycling) && walkDuration >= 3 && isFirst;
    
    return (
      <View key={index} style={styles.legContainer}>
        <View style={styles.legIconContainer}>
          <View
            style={[
              styles.legIcon,
              { backgroundColor: leg.line_color || (isWalking ? '#999' : isCycling ? '#FF9500' : '#007AFF') },
            ]}
          >
            <Ionicons name={getModeIcon(leg.mode) as any} size={16} color="#fff" />
          </View>
          {index < totalLegs - 1 && <View style={styles.legConnector} />}
        </View>

        <View style={styles.legContent}>
          {/* Step header with action label */}
          <View style={styles.stepHeader}>
            <Text style={styles.stepNumber}>Step {index + 1}</Text>
            <Text style={styles.stepAction}>
              {isWalking 
                ? 'Walk' 
                : isCycling 
                  ? 'Cycle' 
                  : legMode.toLowerCase() === 'bus' && leg.line_name
                    ? `Take Bus ${leg.line_name}`
                    : leg.line_name 
                      ? `Take ${leg.line_name}` 
                      : leg.mode}
            </Text>
          </View>

          {/* Line badge for transit */}
          {leg.line_name && !isWalking && !isCycling && (
            <View
              style={[
                styles.lineNameBadge,
                { backgroundColor: leg.line_color || '#007AFF' },
              ]}
            >
              <Text style={styles.lineNameText}>{leg.line_name}</Text>
            </View>
          )}

          {/* From station */}
          <View style={styles.stationRow}>
            <Ionicons name="ellipse" size={10} color="#007AFF" />
            <Text style={styles.stationText}>{leg.from_station}</Text>
          </View>

          {/* Direction, stops, platform, times for transit */}
          {!isWalking && !isCycling && (
            <View style={styles.transitDetails}>
              {leg.direction && (
                <View style={styles.detailItem}>
                  <Ionicons name="compass" size={14} color="#666" />
                  <Text style={styles.detailText}>towards {leg.direction}</Text>
                </View>
              )}
              {leg.num_stops !== null && leg.num_stops > 0 && (
                <View style={styles.detailItem}>
                  <Ionicons name="remove" size={14} color="#666" />
                  <Text style={styles.detailText}>{leg.num_stops} {leg.num_stops === 1 ? 'stop' : 'stops'}</Text>
                </View>
              )}
              {leg.platform && (
                <View style={styles.detailItem}>
                  <Ionicons name="locate" size={14} color="#007AFF" />
                  <Text style={[styles.detailText, styles.platformText]}>{leg.platform}</Text>
                </View>
              )}
            </View>
          )}

          {/* Duration and Times */}
          <View style={styles.legTimingContainer}>
            <Text style={styles.legDuration}>{formatDuration(leg.duration)}</Text>
            {leg.departure_time && leg.arrival_time && (
              <Text style={styles.legTimes}>
                {formatTime(leg.departure_time)} → {formatTime(leg.arrival_time)}
              </Text>
            )}
          </View>

          {/* To station */}
          <View style={[styles.stationRow, styles.toStation]}>
            <Ionicons name="location" size={10} color="#E32017" />
            <Text style={styles.stationText}>{leg.to_station}</Text>
          </View>

          {/* Walking/Cycling directions button */}
          {shouldShowMapButton && (
            <TouchableOpacity
              style={styles.mapButton}
              onPress={() => openMapsForWalking(leg.to_station)}
            >
              <Ionicons name="navigate" size={18} color="#007AFF" />
              <Text style={styles.mapButtonText}>
                Get {isWalking ? 'Walking' : 'Cycling'} Directions to {leg.to_station.split(' ')[0]}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#007AFF" />
            </TouchableOpacity>
          )}

          {/* Change instruction for non-last steps */}
          {index < totalLegs - 1 && !isWalking && !isCycling && (
            <View style={styles.changeNotice}>
              <Ionicons name="swap-horizontal" size={14} color="#FF9500" />
              <Text style={styles.changeText}>Change at {leg.to_station}</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  // Render journey option
  const renderJourneyOption = (journey: JourneyOption, index: number) => {
    const isExpanded = expandedJourney === index;

    return (
      <View key={index} style={styles.journeyCard}>
        <TouchableOpacity
          style={styles.journeyHeader}
          onPress={() => setExpandedJourney(isExpanded ? null : index)}
        >
          <View style={styles.journeyHeaderLeft}>
            <View style={styles.journeyBadge}>
              <Text style={styles.journeyBadgeText}>Option {index + 1}</Text>
            </View>
            <Text style={styles.journeyDuration}>{formatDuration(journey.duration)}</Text>
          </View>

          <View style={styles.journeyHeaderRight}>
            <View style={styles.journeyChanges}>
              <Ionicons name="swap-horizontal" size={16} color="#666" />
              <Text style={styles.journeyChangesText}>
                {journey.changes === 0 ? 'Direct' : `${journey.changes} change${journey.changes > 1 ? 's' : ''}`}
              </Text>
            </View>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={24}
              color="#007AFF"
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.journeyDetails}>
            <View style={styles.journeyTimes}>
              <View style={styles.journeyTime}>
                <Text style={styles.journeyTimeLabel}>Depart</Text>
                <Text style={styles.journeyTimeValue}>{formatTime(journey.start_time)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color="#999" />
              <View style={styles.journeyTime}>
                <Text style={styles.journeyTimeLabel}>Arrive</Text>
                <Text style={styles.journeyTimeValue}>{formatTime(journey.end_time)}</Text>
              </View>
            </View>

            {/* Alternative departure times */}
            {journey.alternative_times && journey.alternative_times.length > 0 && (
              <View style={styles.alternativeTimesContainer}>
                <Text style={styles.alternativeTimesTitle}>Other departure times for this route:</Text>
                <View style={styles.alternativeTimesList}>
                  {journey.alternative_times.map((altTime, index) => (
                    <View key={index} style={styles.alternativeTimeItem}>
                      <View style={styles.alternativeTimeRow}>
                        <Ionicons name="time-outline" size={16} color="#666" />
                        <Text style={styles.alternativeTimeText}>
                          {formatTime(altTime.start_time)} → {formatTime(altTime.end_time)}
                        </Text>
                        <Text style={styles.alternativeTimeDuration}>
                          ({formatDuration(altTime.duration)})
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.legsContainer}>
              {journey.legs.map((leg, legIndex) =>
                renderJourneyLeg(leg, legIndex, journey.legs.length, legIndex === 0)
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="arrow-back" size={28} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Journey Planner</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
          {/* Input Section */}
          <View style={styles.inputSection}>
            {/* From Station */}
            <TouchableOpacity
              style={styles.stationInputCompact}
              onPress={() => setShowFromModal(true)}
            >
              <Ionicons name="radio-button-on" size={20} color="#007AFF" />
              <View style={styles.stationInputContentCompact}>
                <Text style={styles.stationInputLabelCompact}>From</Text>
                <Text
                  style={[
                    styles.stationInputTextCompact,
                    !fromStation && styles.stationInputPlaceholder,
                  ]}
                  numberOfLines={1}
                >
                  {fromStation?.name || 'Select departure station'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </TouchableOpacity>

            {/* Swap Button */}
            <TouchableOpacity
              style={styles.swapButtonCompact}
              onPress={swapStations}
              disabled={!fromStation && !toStation}
              accessibilityLabel="Swap departure and destination"
              accessibilityRole="button"
            >
              <Ionicons name="swap-vertical" size={20} color="#007AFF" />
            </TouchableOpacity>

            {/* To Station */}
            <TouchableOpacity
              style={styles.stationInputCompact}
              onPress={() => setShowToModal(true)}
            >
              <Ionicons name="location" size={20} color="#E32017" />
              <View style={styles.stationInputContentCompact}>
                <Text style={styles.stationInputLabelCompact}>To</Text>
                <Text
                  style={[
                    styles.stationInputTextCompact,
                    !toStation && styles.stationInputPlaceholder,
                  ]}
                  numberOfLines={1}
                >
                  {toStation?.name || 'Select destination station'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#999" />
            </TouchableOpacity>

            {/* Options Row: Time + Accessibility */}
            <View style={styles.optionsRow}>
              {/* Time Control */}
              <TouchableOpacity
                style={styles.timeControlCompact}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons 
                  name="time" 
                  size={20} 
                  color={departureTime ? '#007AFF' : '#666'} 
                />
                {departureTime ? (
                  <View style={styles.timeContentCompact}>
                    <Text style={styles.timeValueCompact}>
                      {formatTime(departureTime.toISOString())}
                    </Text>
                    {departureTime && (
                      <TouchableOpacity 
                        onPress={(e) => {
                          e.stopPropagation();
                          clearDepartureTime();
                        }}
                        style={styles.clearTimeIconCompact}
                      >
                        <Ionicons name="close-circle" size={18} color="#999" />
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <Text style={styles.timeNowTextCompact}>Departing Now</Text>
                )}
              </TouchableOpacity>

              {/* Accessibility Toggle */}
              <View style={styles.accessibilityCompact}>
                <Ionicons name="accessibility" size={20} color="#007AFF" />
                <TouchableOpacity
                  onPress={() => setStepFreeOnly(!stepFreeOnly)}
                  style={[
                    styles.toggleCompact,
                    stepFreeOnly && styles.toggleActiveCompact,
                  ]}
                >
                  <View
                    style={[
                      styles.toggleThumbCompact,
                      stepFreeOnly && styles.toggleThumbActiveCompact,
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Plan Journey Button */}
            <TouchableOpacity
              style={[
                styles.planButton,
                (!fromStation || !toStation) && styles.planButtonDisabled,
              ]}
              onPress={planJourney}
              disabled={!fromStation || !toStation || isLoadingJourney}
            >
              {isLoadingJourney ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.planButtonText}>Plan Journey</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            {/* Error Message */}
            {errorMessage && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={20} color="#E32017" />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            )}
          </View>

          {/* Journey Results */}
          {journeyResults.length > 0 && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsTitle}>Journey Options</Text>
              {journeyResults.map((journey, index) => renderJourneyOption(journey, index))}
            </View>
          )}

          {/* Empty State */}
          {!isLoadingJourney && journeyResults.length === 0 && !errorMessage && (
            <View style={styles.emptyStateContainer}>
              <Ionicons name="map" size={64} color="#CCC" />
              <Text style={styles.emptyStateTitle}>Plan Your Journey</Text>
              <Text style={styles.emptyStateText}>
                Select your departure and destination stations to see route options
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Time Picker */}
        {showTimePicker && (
          <Modal
            visible={showTimePicker}
            transparent={true}
            animationType="slide"
          >
            <View style={styles.timePickerModal}>
              <View style={styles.timePickerContainer}>
                <View style={styles.timePickerHeader}>
                  <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                    <Text style={styles.timePickerCancel}>Cancel</Text>
                  </TouchableOpacity>
                  <Text style={styles.timePickerTitle}>Choose Departure Time</Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (!departureTime) {
                        setDepartureTime(new Date());
                      }
                      setShowTimePicker(false);
                    }}
                  >
                    <Text style={styles.timePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={departureTime || new Date()}
                  mode="time"
                  is24Hour={true}
                  display="spinner"
                  onChange={(event, date) => {
                    if (date) {
                      setDepartureTime(date);
                    }
                  }}
                  textColor="#000"
                />
              </View>
            </View>
          </Modal>
        )}

        {/* Search Modals */}
        {renderSearchModal(
          showFromModal,
          () => setShowFromModal(false),
          fromSearchText,
          setFromSearchText,
          fromSearchResults,
          isSearchingFrom,
          (station) => {
            setFromStation(station);
            setFromSearchText(station.name);
          },
          'From'
        )}

        {renderSearchModal(
          showToModal,
          () => setShowToModal(false),
          toSearchText,
          setToSearchText,
          toSearchResults,
          isSearchingTo,
          (station) => {
            setToStation(station);
            setToSearchText(station.name);
          },
          'To'
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  scrollView: {
    flex: 1,
  },
  inputSection: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 16,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  stationInputCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#F5F5F7',
    borderRadius: 10,
    marginBottom: 4,
    gap: 10,
  },
  stationInputContentCompact: {
    flex: 1,
  },
  stationInputLabelCompact: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
    fontWeight: '600',
  },
  stationInputTextCompact: {
    fontSize: 14,
    color: '#000',
    fontWeight: '500',
  },
  swapButtonCompact: {
    alignSelf: 'center',
    padding: 4,
    marginVertical: 2,
  },
  optionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 12,
    gap: 12,
  },
  timeControlCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F7',
    borderRadius: 10,
    gap: 8,
  },
  timeContentCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeNowTextCompact: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  timeValueCompact: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  clearTimeIconCompact: {
    padding: 2,
  },
  accessibilityCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  toggleCompact: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E5E5E7',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActiveCompact: {
    backgroundColor: '#34C759',
  },
  toggleThumbCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 2,
  },
  toggleThumbActiveCompact: {
    alignSelf: 'flex-end',
  },
  stationInputPlaceholder: {
    color: '#999',
    fontWeight: '400',
  },
  planButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  planButtonDisabled: {
    backgroundColor: '#CCC',
  },
  planButtonText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#fff',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FFF0F0',
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#E32017',
  },
  resultsSection: {
    padding: 16,
    paddingTop: 0,
  },
  resultsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  journeyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  journeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  journeyHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  journeyBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  journeyBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
  },
  journeyDuration: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  journeyHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  journeyChanges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  journeyChangesText: {
    fontSize: 14,
    color: '#666',
  },
  journeyDetails: {
    borderTopWidth: 1,
    borderTopColor: '#E5E5E7',
    padding: 16,
  },
  journeyTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  journeyTime: {
    alignItems: 'center',
  },
  journeyTimeLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  journeyTimeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  legsContainer: {
    gap: 0,
  },
  legContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  legIconContainer: {
    alignItems: 'center',
  },
  legIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legConnector: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E5E7',
    marginVertical: 4,
  },
  legContent: {
    flex: 1,
    paddingBottom: 16,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#007AFF',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  stepAction: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  lineNameBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  lineNameText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  toStation: {
    marginTop: 12,
  },
  stationText: {
    fontSize: 15,
    color: '#000',
    fontWeight: '500',
  },
  transitDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginVertical: 8,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: '#666',
  },
  platformText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  legDuration: {
    fontSize: 13,
    color: '#999',
    fontWeight: '600',
  },
  legTimingContainer: {
    marginTop: 8,
    gap: 4,
  },
  legTimes: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
  },
  mapButtonText: {
    flex: 1,
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  changeNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  changeText: {
    fontSize: 13,
    color: '#FF9500',
    fontWeight: '600',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  searchResultText: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  alternativeTimesContainer: {
    marginTop: 16,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E5E7',
  },
  alternativeTimesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  alternativeTimesList: {
    gap: 6,
  },
  alternativeTimeItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
  },
  alternativeTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alternativeTimeText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  alternativeTimeDuration: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  timePickerModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  timePickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  timePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  timePickerCancel: {
    fontSize: 16,
    color: '#999',
  },
  timePickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  timePickerDone: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
});