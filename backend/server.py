from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
from enum import Enum
import httpx
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# TfL API Configuration
TFL_PRIMARY_KEY = "5a820a9256064e34bf512451b75338ec"
TFL_SECONDARY_KEY = "67c501f2b54d4c6a89d2dfa2f9a2cd92"
TFL_BASE_URL = "https://api.tfl.gov.uk"

# Create the main app without a prefix
app = FastAPI(title="My Commute API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Enums for TfL data
class LineStatus(str, Enum):
    GOOD_SERVICE = "Good Service"
    MINOR_DELAYS = "Minor Delays"
    SEVERE_DELAYS = "Severe Delays"
    PLANNED_CLOSURE = "Planned Closure"
    SUSPENDED = "Suspended"
    SPECIAL_SERVICE = "Special Service"

class LineColor(str, Enum):
    CENTRAL = "#E32017"
    CIRCLE = "#FFD300"
    DISTRICT = "#00782A"
    HAMMERSMITH_CITY = "#F3A9BB"
    JUBILEE = "#A0A5A9"
    METROPOLITAN = "#9B0056"
    NORTHERN = "#000000"
    PICCADILLY = "#003688"
    VICTORIA = "#0098D4"
    WATERLOO_CITY = "#95CDBA"
    BAKERLOO = "#B36305"
    ELIZABETH = "#7156A5"

# Models
class UserPreferences(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    saved_lines: List[str] = []
    saved_stations: List[str] = []
    is_pro: bool = False
    notification_settings: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class LineStatusResponse(BaseModel):
    id: str
    name: str
    color: str
    status: LineStatus
    status_severity: int  # 0-10, 0 = good, 10 = severe
    reason: Optional[str] = None
    updated_at: datetime

class Departure(BaseModel):
    line: str
    destination: str
    platform: str
    expected_arrival: datetime
    minutes_away: int

class StationResponse(BaseModel):
    id: str
    name: str
    lines: List[str]
    departures: List[Departure]
    updated_at: datetime

class NearbyStation(BaseModel):
    id: str
    name: str
    distance_meters: int
    walk_time_minutes: int
    lines: List[str]
    line_statuses: List[LineStatusResponse]

# TfL Service Class
class TfLService:
    def __init__(self):
        self.primary_key = TFL_PRIMARY_KEY
        self.secondary_key = TFL_SECONDARY_KEY
        self.base_url = TFL_BASE_URL
        self.client = None
        
    async def get_client(self):
        if not self.client:
            self.client = httpx.AsyncClient(timeout=30.0)
        return self.client
    
    async def close_client(self):
        if self.client:
            await self.client.aclose()
    
    def map_tfl_status_to_severity(self, status_description: str) -> int:
        """Map TfL status descriptions to severity levels (0-10)"""
        status_lower = status_description.lower()
        if "good service" in status_lower or "running well" in status_lower:
            return 0
        elif "minor delay" in status_lower or "minor disruption" in status_lower:
            return 3
        elif "severe delay" in status_lower or "major disruption" in status_lower:
            return 7
        elif "suspended" in status_lower or "closed" in status_lower:
            return 10
        elif "planned closure" in status_lower or "part suspended" in status_lower:
            return 8
        else:
            return 2  # Default for unknown statuses
    
    def get_line_color(self, line_id: str) -> str:
        """Get official TfL line colors"""
        color_map = {
            "central": "#E32017",
            "circle": "#FFD300", 
            "district": "#00782A",
            "hammersmith-city": "#F3A9BB",
            "jubilee": "#A0A5A9",
            "metropolitan": "#9B0056",
            "northern": "#000000",
            "piccadilly": "#003688",
            "victoria": "#0098D4",
            "waterloo-city": "#95CDBA",
            "bakerloo": "#B36305",
            "elizabeth": "#7156A5",
            "dlr": "#00A4A7",
            "london-overground": "#EE7C0E"
        }
        return color_map.get(line_id, "#666666")
    
    async def get_tube_line_status(self):
        """Get status of all tube lines from TfL API"""
        try:
            client = await self.get_client()
            url = f"{self.base_url}/line/mode/tube,elizabeth-line,dlr/status"
            params = {"app_key": self.primary_key}
            
            response = await client.get(url, params=params)
            response.raise_for_status()
            
            data = response.json()
            lines = []
            
            for line_data in data:
                line_id = line_data.get("id", "")
                line_name = line_data.get("name", "")
                
                # Get status info
                line_statuses = line_data.get("lineStatuses", [])
                status_description = "Good Service"
                reason = None
                severity = 0
                
                if line_statuses:
                    status_info = line_statuses[0]
                    status_description = status_info.get("statusSeverityDescription", "Good Service")
                    reason = status_info.get("reason", None)
                    severity = self.map_tfl_status_to_severity(status_description)
                
                line_response = LineStatusResponse(
                    id=line_id,
                    name=line_name,
                    color=self.get_line_color(line_id),
                    status=status_description,
                    status_severity=severity,
                    reason=reason,
                    updated_at=datetime.utcnow()
                )
                lines.append(line_response)
            
            return lines
            
        except Exception as e:
            logger.error(f"Error fetching TfL line status: {e}")
            # Return mock data as fallback
            return await self._get_mock_lines()
    
    async def get_single_line_status(self, line_id: str):
        """Get status of a specific line"""
        try:
            client = await self.get_client()
            url = f"{self.base_url}/line/{line_id}/status"
            params = {"app_key": self.primary_key}
            
            response = await client.get(url, params=params)
            response.raise_for_status()
            
            data = response.json()
            if not data:
                raise HTTPException(status_code=404, detail="Line not found")
            
            line_data = data[0]  # TfL returns array with single item
            line_name = line_data.get("name", "")
            
            # Get status info
            line_statuses = line_data.get("lineStatuses", [])
            status_description = "Good Service"
            reason = None
            severity = 0
            
            if line_statuses:
                status_info = line_statuses[0]
                status_description = status_info.get("statusSeverityDescription", "Good Service")
                reason = status_info.get("reason", None)
                severity = self.map_tfl_status_to_severity(status_description)
            
            return LineStatusResponse(
                id=line_id,
                name=line_name,
                color=self.get_line_color(line_id),
                status=status_description,
                status_severity=severity,
                reason=reason,
                updated_at=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Error fetching TfL line status for {line_id}: {e}")
            # Return mock data as fallback
            return await self._get_mock_single_line(line_id)
    
    async def get_station_arrivals(self, station_id: str):
        """Get arrivals for a specific station"""
        try:
            client = await self.get_client()
            
            # First get station info
            station_url = f"{self.base_url}/StopPoint/{station_id}"
            station_params = {"app_key": self.primary_key}
            
            station_response = await client.get(station_url, params=station_params)
            station_response.raise_for_status()
            station_data = station_response.json()
            
            station_name = station_data.get("commonName", "Unknown Station")
            
            # Get arrivals
            arrivals_url = f"{self.base_url}/StopPoint/{station_id}/Arrivals"
            arrivals_params = {"app_key": self.primary_key}
            
            arrivals_response = await client.get(arrivals_url, params=arrivals_params)
            arrivals_response.raise_for_status()
            arrivals_data = arrivals_response.json()
            
            # Process arrivals
            departures = []
            for arrival in arrivals_data[:10]:  # Limit to 10 arrivals
                line_name = arrival.get("lineName", "")
                destination = arrival.get("destinationName", "")
                platform_name = arrival.get("platformName", "Platform")
                time_to_station = arrival.get("timeToStation", 0)
                minutes_away = max(1, time_to_station // 60)
                expected_time = datetime.utcnow() + timedelta(seconds=time_to_station)
                
                departure = Departure(
                    line=line_name,
                    destination=destination,
                    platform=platform_name,
                    expected_arrival=expected_time,
                    minutes_away=minutes_away
                )
                departures.append(departure)
            
            # Sort by arrival time
            departures.sort(key=lambda x: x.minutes_away)
            
            return StationResponse(
                id=station_id,
                name=station_name,
                lines=[],  # TfL doesn't provide this in a simple way
                departures=departures[:6],  # Top 6
                updated_at=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Error fetching TfL arrivals for {station_id}: {e}")
            # Return mock data as fallback
            return await self._get_mock_station(station_id)
    
    async def search_stations(self, query: str):
        """Search for stations by name"""
        try:
            client = await self.get_client()
            url = f"{self.base_url}/StopPoint/Search/{query}"
            params = {
                "app_key": self.primary_key,
                "modes": "tube,elizabeth-line,dlr",
                "maxResults": 10
            }
            
            response = await client.get(url, params=params)
            response.raise_for_status()
            
            data = response.json()
            stations = []
            
            for match in data.get("matches", []):
                station_id = match.get("id", "")
                station_name = match.get("name", "")
                
                if station_id and station_name:
                    stations.append({
                        "id": station_id,
                        "name": station_name,
                        "lines": []  # Would need additional call to get this
                    })
            
            return stations
            
        except Exception as e:
            logger.error(f"Error searching TfL stations for '{query}': {e}")
            return []
    
    async def _get_mock_lines(self):
        """Fallback mock data for when TfL API fails"""
        mock_lines = [
            LineStatusResponse(
                id="central",
                name="Central Line",
                color="#E32017",
                status="Good Service",
                status_severity=0,
                reason=None,
                updated_at=datetime.utcnow()
            ),
            LineStatusResponse(
                id="victoria",
                name="Victoria Line", 
                color="#0098D4",
                status="Good Service",
                status_severity=0,
                reason=None,
                updated_at=datetime.utcnow()
            )
        ]
        return mock_lines
    
    async def _get_mock_single_line(self, line_id: str):
        """Fallback mock data for single line"""
        return LineStatusResponse(
            id=line_id,
            name=f"{line_id.title()} Line",
            color=self.get_line_color(line_id),
            status="Service Update Unavailable",
            status_severity=1,
            reason="Unable to connect to live data",
            updated_at=datetime.utcnow()
        )
    
    async def _get_mock_station(self, station_id: str):
        """Fallback mock data for station"""
        return StationResponse(
            id=station_id,
            name="Station (Live Data Unavailable)",
            lines=[],
            departures=[],
            updated_at=datetime.utcnow()
        )

# Initialize TfL service
tfl_service = TfLService()

# Helper functions for nearby stations (mock implementation)
def calculate_mock_nearby_stations(lat: float, lon: float) -> List[NearbyStation]:
    """Mock implementation of nearby stations - in production this would use TfL StopPoint API"""
    # Mock popular London stations with their approximate coordinates
    mock_nearby = [
        {
            "id": "940GZZLUOXC", 
            "name": "Oxford Circus Underground Station",
            "distance": 200
        },
        {
            "id": "940GZZLUTCR", 
            "name": "Tottenham Court Road Underground Station", 
            "distance": 400
        },
        {
            "id": "940GZZLUBND",
            "name": "Bond Street Underground Station",
            "distance": 600
        },
        {
            "id": "940GZZLUGPS",
            "name": "Goodge Street Underground Station", 
            "distance": 800
        }
    ]
    
    nearby_stations = []
    for station in mock_nearby:
        walk_time = max(2, station["distance"] // 80)  # Rough walking time estimate
        
        nearby_station = NearbyStation(
            id=station["id"],
            name=station["name"],
            distance_meters=station["distance"],
            walk_time_minutes=walk_time,
            lines=[],  # Would be populated by actual TfL data
            line_statuses=[]  # Would be populated by actual TfL data  
        )
        nearby_stations.append(nearby_station)
    
    return sorted(nearby_stations, key=lambda x: x.distance_meters)[:5]

# API Routes
@api_router.get("/")
async def root():
    return {"message": "My Commute API", "version": "1.0.0"}

@api_router.get("/lines", response_model=List[LineStatusResponse])
async def get_all_lines():
    """Get status of all tube lines from TfL API"""
    return await tfl_service.get_tube_line_status()

@api_router.get("/lines/{line_id}", response_model=LineStatusResponse)
async def get_line_status(line_id: str):
    """Get status of a specific tube line from TfL API"""
    return await tfl_service.get_single_line_status(line_id)

@api_router.get("/stations/nearby", response_model=List[NearbyStation])
async def get_nearby_stations(lat: float, lon: float):
    """Get nearby stations based on GPS coordinates"""
    # For now, return mock nearby stations
    # In full production, this would use TfL StopPoint API with lat/lon radius search
    return calculate_mock_nearby_stations(lat, lon)

@api_router.get("/stations/{station_id}", response_model=StationResponse)
async def get_station_departures(station_id: str):
    """Get departure information for a specific station from TfL API"""
    return await tfl_service.get_station_arrivals(station_id)

# User Preferences Routes
@api_router.post("/user/preferences", response_model=UserPreferences)
async def create_user_preferences(user_id: str, preferences: dict):
    """Create or update user preferences"""
    existing = await db.user_preferences.find_one({"user_id": user_id})
    
    if existing:
        # Update existing
        update_data = {
            **preferences,
            "updated_at": datetime.utcnow()
        }
        await db.user_preferences.update_one(
            {"user_id": user_id},
            {"$set": update_data}
        )
        updated = await db.user_preferences.find_one({"user_id": user_id})
        return UserPreferences(**updated)
    else:
        # Create new
        new_prefs = UserPreferences(
            user_id=user_id,
            **preferences
        )
        await db.user_preferences.insert_one(new_prefs.dict())
        return new_prefs

@api_router.get("/user/{user_id}/preferences", response_model=UserPreferences)
async def get_user_preferences(user_id: str):
    """Get user preferences"""
    prefs = await db.user_preferences.find_one({"user_id": user_id})
    if not prefs:
        # Return default preferences
        default_prefs = UserPreferences(user_id=user_id)
        await db.user_preferences.insert_one(default_prefs.dict())
        return default_prefs
    return UserPreferences(**prefs)

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
