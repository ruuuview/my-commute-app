#!/usr/bin/env python3
"""
Backend API Testing for My Commute TfL Mock API
Tests all endpoints as specified in the review request
"""

import requests
import json
import sys
from datetime import datetime
from typing import Dict, List, Any

# Backend URL from frontend environment
BACKEND_URL = "https://commute-dash.preview.emergentagent.com/api"

class CommuteAPITester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.test_results = []
        self.failed_tests = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        if not success:
            self.failed_tests.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}")
        if details:
            print(f"    {details}")
    
    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = requests.get(f"{self.base_url}/")
            if response.status_code == 200:
                data = response.json()
                if "message" in data and "version" in data:
                    self.log_test("API Root", True, f"Version: {data.get('version')}")
                else:
                    self.log_test("API Root", False, "Missing message or version in response")
            else:
                self.log_test("API Root", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_test("API Root", False, f"Exception: {str(e)}")
    
    def test_get_all_lines(self):
        """Test GET /api/lines - Returns all tube lines with status"""
        try:
            response = requests.get(f"{self.base_url}/lines")
            if response.status_code == 200:
                lines = response.json()
                if isinstance(lines, list) and len(lines) > 0:
                    # Check structure of first line
                    line = lines[0]
                    required_fields = ['id', 'name', 'color', 'status', 'status_severity', 'updated_at']
                    missing_fields = [field for field in required_fields if field not in line]
                    
                    if not missing_fields:
                        # Check TfL official colors are present
                        colors_found = [l['color'] for l in lines]
                        tfl_colors = ['#E32017', '#FFD300', '#00782A', '#000000', '#003688', '#0098D4']
                        has_tfl_colors = any(color in colors_found for color in tfl_colors)
                        
                        if has_tfl_colors:
                            self.log_test("GET /api/lines", True, f"Found {len(lines)} lines with proper TfL colors")
                        else:
                            self.log_test("GET /api/lines", False, "No official TfL colors found")
                    else:
                        self.log_test("GET /api/lines", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("GET /api/lines", False, "Empty or invalid response format")
            else:
                self.log_test("GET /api/lines", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_test("GET /api/lines", False, f"Exception: {str(e)}")
    
    def test_get_specific_line(self, line_id: str):
        """Test GET /api/lines/{line_id} - Returns specific line status"""
        try:
            response = requests.get(f"{self.base_url}/lines/{line_id}")
            if response.status_code == 200:
                line = response.json()
                required_fields = ['id', 'name', 'color', 'status', 'status_severity', 'updated_at']
                missing_fields = [field for field in required_fields if field not in line]
                
                if not missing_fields:
                    # Verify the line ID matches
                    if line['id'] == line_id:
                        # Check status levels are realistic
                        severity = line.get('status_severity', -1)
                        if 0 <= severity <= 10:
                            details = f"Line: {line['name']}, Status: {line['status']}, Severity: {severity}"
                            if line.get('reason'):
                                details += f", Reason: {line['reason']}"
                            self.log_test(f"GET /api/lines/{line_id}", True, details)
                        else:
                            self.log_test(f"GET /api/lines/{line_id}", False, f"Invalid severity level: {severity}")
                    else:
                        self.log_test(f"GET /api/lines/{line_id}", False, f"ID mismatch: expected {line_id}, got {line['id']}")
                else:
                    self.log_test(f"GET /api/lines/{line_id}", False, f"Missing fields: {missing_fields}")
            else:
                self.log_test(f"GET /api/lines/{line_id}", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_test(f"GET /api/lines/{line_id}", False, f"Exception: {str(e)}")
    
    def test_get_station_departures(self, station_id: str):
        """Test GET /api/stations/{station_id} - Returns station with departure board"""
        try:
            response = requests.get(f"{self.base_url}/stations/{station_id}")
            if response.status_code == 200:
                station = response.json()
                required_fields = ['id', 'name', 'lines', 'departures', 'updated_at']
                missing_fields = [field for field in required_fields if field not in station]
                
                if not missing_fields:
                    departures = station.get('departures', [])
                    if isinstance(departures, list) and len(departures) > 0:
                        # Check departure structure
                        departure = departures[0]
                        dep_fields = ['line', 'destination', 'platform', 'expected_arrival', 'minutes_away']
                        missing_dep_fields = [field for field in dep_fields if field not in departure]
                        
                        if not missing_dep_fields:
                            # Check realistic train times (should be reasonable)
                            minutes_away = departure.get('minutes_away', -1)
                            if 0 <= minutes_away <= 30:  # Reasonable range
                                details = f"Station: {station['name']}, {len(departures)} departures, Next: {minutes_away}min"
                                self.log_test(f"GET /api/stations/{station_id}", True, details)
                            else:
                                self.log_test(f"GET /api/stations/{station_id}", False, f"Unrealistic departure time: {minutes_away}min")
                        else:
                            self.log_test(f"GET /api/stations/{station_id}", False, f"Missing departure fields: {missing_dep_fields}")
                    else:
                        self.log_test(f"GET /api/stations/{station_id}", False, "No departures found")
                else:
                    self.log_test(f"GET /api/stations/{station_id}", False, f"Missing fields: {missing_fields}")
            else:
                self.log_test(f"GET /api/stations/{station_id}", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_test(f"GET /api/stations/{station_id}", False, f"Exception: {str(e)}")
    
    def test_nearby_stations(self, lat: float, lon: float):
        """Test GET /api/stations/nearby - Returns nearby stations"""
        try:
            response = requests.get(f"{self.base_url}/stations/nearby", params={"lat": lat, "lon": lon})
            if response.status_code == 200:
                stations = response.json()
                if isinstance(stations, list) and len(stations) > 0:
                    station = stations[0]
                    required_fields = ['id', 'name', 'distance_meters', 'walk_time_minutes', 'lines', 'line_statuses']
                    missing_fields = [field for field in required_fields if field not in station]
                    
                    if not missing_fields:
                        # Check realistic distances and walk times
                        distance = station.get('distance_meters', -1)
                        walk_time = station.get('walk_time_minutes', -1)
                        
                        if distance > 0 and walk_time > 0:
                            # Check line statuses are included
                            line_statuses = station.get('line_statuses', [])
                            if isinstance(line_statuses, list) and len(line_statuses) > 0:
                                details = f"Found {len(stations)} nearby stations, closest: {distance}m ({walk_time}min walk)"
                                self.log_test("GET /api/stations/nearby", True, details)
                            else:
                                self.log_test("GET /api/stations/nearby", False, "No line statuses in nearby stations")
                        else:
                            self.log_test("GET /api/stations/nearby", False, f"Invalid distance/time: {distance}m, {walk_time}min")
                    else:
                        self.log_test("GET /api/stations/nearby", False, f"Missing fields: {missing_fields}")
                else:
                    self.log_test("GET /api/stations/nearby", False, "Empty or invalid response format")
            else:
                self.log_test("GET /api/stations/nearby", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_test("GET /api/stations/nearby", False, f"Exception: {str(e)}")
    
    def test_get_user_preferences(self, user_id: str):
        """Test GET /api/user/{user_id}/preferences - User preferences (creates default if not exists)"""
        try:
            response = requests.get(f"{self.base_url}/user/{user_id}/preferences")
            if response.status_code == 200:
                prefs = response.json()
                required_fields = ['id', 'user_id', 'saved_lines', 'saved_stations', 'is_pro', 'created_at', 'updated_at']
                missing_fields = [field for field in required_fields if field not in prefs]
                
                if not missing_fields:
                    if prefs['user_id'] == user_id:
                        details = f"User: {user_id}, Pro: {prefs['is_pro']}, Lines: {len(prefs['saved_lines'])}, Stations: {len(prefs['saved_stations'])}"
                        self.log_test(f"GET /api/user/{user_id}/preferences", True, details)
                    else:
                        self.log_test(f"GET /api/user/{user_id}/preferences", False, f"User ID mismatch: expected {user_id}, got {prefs['user_id']}")
                else:
                    self.log_test(f"GET /api/user/{user_id}/preferences", False, f"Missing fields: {missing_fields}")
            else:
                self.log_test(f"GET /api/user/{user_id}/preferences", False, f"Status code: {response.status_code}")
        except Exception as e:
            self.log_test(f"GET /api/user/{user_id}/preferences", False, f"Exception: {str(e)}")
    
    def test_create_user_preferences(self, user_id: str, preferences: dict):
        """Test POST /api/user/preferences - Create/update user preferences"""
        try:
            # First, create/update preferences
            payload = {
                "user_id": user_id,
                **preferences
            }
            response = requests.post(f"{self.base_url}/user/preferences", 
                                   params={"user_id": user_id},
                                   json=preferences)
            
            if response.status_code == 200:
                created_prefs = response.json()
                required_fields = ['id', 'user_id', 'saved_lines', 'saved_stations', 'is_pro']
                missing_fields = [field for field in required_fields if field not in created_prefs]
                
                if not missing_fields:
                    # Verify the data was saved correctly
                    if created_prefs['user_id'] == user_id:
                        # Check if preferences were applied
                        saved_lines = created_prefs.get('saved_lines', [])
                        expected_lines = preferences.get('saved_lines', [])
                        
                        if set(saved_lines) == set(expected_lines):
                            details = f"Created preferences for {user_id}, Lines: {saved_lines}, Pro: {created_prefs['is_pro']}"
                            self.log_test("POST /api/user/preferences", True, details)
                        else:
                            self.log_test("POST /api/user/preferences", False, f"Lines mismatch: expected {expected_lines}, got {saved_lines}")
                    else:
                        self.log_test("POST /api/user/preferences", False, f"User ID mismatch: expected {user_id}, got {created_prefs['user_id']}")
                else:
                    self.log_test("POST /api/user/preferences", False, f"Missing fields: {missing_fields}")
            else:
                self.log_test("POST /api/user/preferences", False, f"Status code: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_test("POST /api/user/preferences", False, f"Exception: {str(e)}")
    
    def test_error_handling(self):
        """Test error handling for invalid line/station IDs"""
        # Test invalid line ID
        try:
            response = requests.get(f"{self.base_url}/lines/invalid-line")
            if response.status_code == 404:
                self.log_test("Error Handling - Invalid Line", True, "Returns 404 for invalid line ID")
            else:
                self.log_test("Error Handling - Invalid Line", False, f"Expected 404, got {response.status_code}")
        except Exception as e:
            self.log_test("Error Handling - Invalid Line", False, f"Exception: {str(e)}")
        
        # Test invalid station ID
        try:
            response = requests.get(f"{self.base_url}/stations/invalid-station")
            if response.status_code == 404:
                self.log_test("Error Handling - Invalid Station", True, "Returns 404 for invalid station ID")
            else:
                self.log_test("Error Handling - Invalid Station", False, f"Expected 404, got {response.status_code}")
        except Exception as e:
            self.log_test("Error Handling - Invalid Station", False, f"Exception: {str(e)}")
    
    def test_data_persistence(self, user_id: str):
        """Test that user preferences persist to MongoDB"""
        try:
            # Create preferences
            test_prefs = {
                "saved_lines": ["central", "northern"],
                "saved_stations": ["oxford-circus"],
                "is_pro": True
            }
            
            # Create the preferences
            response1 = requests.post(f"{self.base_url}/user/preferences", 
                                    params={"user_id": user_id},
                                    json=test_prefs)
            
            if response1.status_code == 200:
                # Retrieve the preferences to verify persistence
                response2 = requests.get(f"{self.base_url}/user/{user_id}/preferences")
                
                if response2.status_code == 200:
                    retrieved_prefs = response2.json()
                    
                    # Check if data persisted correctly
                    if (set(retrieved_prefs['saved_lines']) == set(test_prefs['saved_lines']) and
                        set(retrieved_prefs['saved_stations']) == set(test_prefs['saved_stations']) and
                        retrieved_prefs['is_pro'] == test_prefs['is_pro']):
                        self.log_test("Data Persistence", True, "User preferences persist correctly to MongoDB")
                    else:
                        self.log_test("Data Persistence", False, "Retrieved preferences don't match saved preferences")
                else:
                    self.log_test("Data Persistence", False, f"Failed to retrieve preferences: {response2.status_code}")
            else:
                self.log_test("Data Persistence", False, f"Failed to create preferences: {response1.status_code}")
        except Exception as e:
            self.log_test("Data Persistence", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print(f"🚀 Starting My Commute Backend API Tests")
        print(f"Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Test API root
        self.test_api_root()
        
        # Test line endpoints
        self.test_get_all_lines()
        self.test_get_specific_line("central")
        self.test_get_specific_line("northern")
        
        # Test station endpoints
        self.test_get_station_departures("oxford-circus")
        self.test_get_station_departures("king-cross")
        
        # Test nearby stations
        self.test_nearby_stations(51.5074, -0.1278)  # London coordinates
        
        # Test user preferences
        test_user_id = "test-user-london-commuter"
        self.test_get_user_preferences(test_user_id)
        
        test_preferences = {
            "saved_lines": ["central", "victoria"],
            "saved_stations": ["oxford-circus", "king-cross"],
            "is_pro": False
        }
        self.test_create_user_preferences(test_user_id, test_preferences)
        
        # Test data persistence
        persistence_user_id = "persistence-test-user"
        self.test_data_persistence(persistence_user_id)
        
        # Test error handling
        self.test_error_handling()
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = total_tests - len(self.failed_tests)
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {len(self.failed_tests)}")
        print(f"Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if self.failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in self.failed_tests:
                print(f"  • {test['test']}: {test['details']}")
        
        return len(self.failed_tests) == 0

if __name__ == "__main__":
    tester = CommuteAPITester()
    success = tester.run_all_tests()
    sys.exit(0 if success else 1)