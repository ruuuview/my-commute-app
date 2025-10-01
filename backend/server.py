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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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

# Mock Data
MOCK_LINES = {
    "central": {
        "id": "central",
        "name": "Central Line",
        "color": LineColor.CENTRAL,
        "status": LineStatus.GOOD_SERVICE,
        "status_severity": 0
    },
    "circle": {
        "id": "circle",
        "name": "Circle Line",
        "color": LineColor.CIRCLE,
        "status": LineStatus.MINOR_DELAYS,
        "status_severity": 3,
        "reason": "Signal problems at King's Cross"
    },
    "district": {
        "id": "district",
        "name": "District Line",
        "color": LineColor.DISTRICT,
        "status": LineStatus.GOOD_SERVICE,
        "status_severity": 0
    },
    "jubilee": {
        "id": "jubilee",
        "name": "Jubilee Line",
        "color": LineColor.JUBILEE,
        "status": LineStatus.GOOD_SERVICE,
        "status_severity": 0
    },
    "northern": {
        "id": "northern",
        "name": "Northern Line",
        "color": LineColor.NORTHERN,
        "status": LineStatus.SEVERE_DELAYS,
        "status_severity": 7,
        "reason": "Customer incident at Camden Town"
    },
    "piccadilly": {
        "id": "piccadilly",
        "name": "Piccadilly Line",
        "color": LineColor.PICCADILLY,
        "status": LineStatus.GOOD_SERVICE,
        "status_severity": 0
    },
    "victoria": {
        "id": "victoria",
        "name": "Victoria Line",
        "color": LineColor.VICTORIA,
        "status": LineStatus.GOOD_SERVICE,
        "status_severity": 0
    },
    "elizabeth": {
        "id": "elizabeth",
        "name": "Elizabeth Line",
        "color": LineColor.ELIZABETH,
        "status": LineStatus.GOOD_SERVICE,
        "status_severity": 0
    }
}

MOCK_STATIONS = {
    "king-cross": {
        "id": "king-cross",
        "name": "King's Cross St. Pancras",
        "lines": ["circle", "hammersmith-city", "metropolitan", "northern", "piccadilly", "victoria"]
    },
    "oxford-circus": {
        "id": "oxford-circus",
        "name": "Oxford Circus",
        "lines": ["central", "northern", "victoria"]
    },
    "london-bridge": {
        "id": "london-bridge",
        "name": "London Bridge",
        "lines": ["jubilee", "northern"]
    },
    "waterloo": {
        "id": "waterloo",
        "name": "Waterloo",
        "lines": ["bakerloo", "jubilee", "northern", "waterloo-city"]
    }
}

# Helper functions
def generate_mock_departures(station_id: str) -> List[Departure]:
    station = MOCK_STATIONS.get(station_id, {})
    departures = []
    now = datetime.utcnow()
    
    for line_id in station.get('lines', []):
        line = MOCK_LINES.get(line_id)
        if line:
            # Generate 2-3 departures per line
            for i in range(2):
                minutes_away = 2 + (i * 3) + (hash(f"{station_id}{line_id}{i}") % 5)
                departure = Departure(
                    line=line['name'],
                    destination=f"{line['name']} - Eastbound" if i % 2 == 0 else f"{line['name']} - Westbound",
                    platform=f"Platform {(hash(f'{line_id}{i}') % 4) + 1}",
                    expected_arrival=now + timedelta(minutes=minutes_away),
                    minutes_away=minutes_away
                )
                departures.append(departure)
    
    return sorted(departures, key=lambda x: x.minutes_away)[:6]  # Return top 6 soonest

# API Routes
@api_router.get("/")
async def root():
    return {"message": "My Commute API", "version": "1.0.0"}

@api_router.get("/lines", response_model=List[LineStatusResponse])
async def get_all_lines():
    """Get status of all tube lines"""
    lines = []
    for line_data in MOCK_LINES.values():
        line_response = LineStatusResponse(
            id=line_data['id'],
            name=line_data['name'],
            color=line_data['color'],
            status=line_data['status'],
            status_severity=line_data['status_severity'],
            reason=line_data.get('reason'),
            updated_at=datetime.utcnow()
        )
        lines.append(line_response)
    return lines

@api_router.get("/lines/{line_id}", response_model=LineStatusResponse)
async def get_line_status(line_id: str):
    """Get status of a specific tube line"""
    line_data = MOCK_LINES.get(line_id)
    if not line_data:
        raise HTTPException(status_code=404, detail="Line not found")
    
    return LineStatusResponse(
        id=line_data['id'],
        name=line_data['name'],
        color=line_data['color'],
        status=line_data['status'],
        status_severity=line_data['status_severity'],
        reason=line_data.get('reason'),
        updated_at=datetime.utcnow()
    )

@api_router.get("/stations/{station_id}", response_model=StationResponse)
async def get_station_departures(station_id: str):
    """Get departure information for a specific station"""
    station_data = MOCK_STATIONS.get(station_id)
    if not station_data:
        raise HTTPException(status_code=404, detail="Station not found")
    
    departures = generate_mock_departures(station_id)
    
    return StationResponse(
        id=station_data['id'],
        name=station_data['name'],
        lines=station_data['lines'],
        departures=departures,
        updated_at=datetime.utcnow()
    )

@api_router.get("/stations/nearby", response_model=List[NearbyStation])
async def get_nearby_stations(lat: float, lon: float):
    """Get nearby stations based on GPS coordinates (mock implementation)"""
    # Mock nearby stations - in real implementation, this would use TfL API
    nearby = []
    base_distance = 200  # meters
    
    for i, (station_id, station_data) in enumerate(MOCK_STATIONS.items()):
        # Mock distance calculation
        distance = base_distance + (i * 150)
        walk_time = max(2, distance // 80)  # Rough walking time estimate
        
        # Get line statuses for this station
        line_statuses = []
        for line_id in station_data['lines']:
            line_data = MOCK_LINES.get(line_id)
            if line_data:
                line_status = LineStatusResponse(
                    id=line_data['id'],
                    name=line_data['name'],
                    color=line_data['color'],
                    status=line_data['status'],
                    status_severity=line_data['status_severity'],
                    reason=line_data.get('reason'),
                    updated_at=datetime.utcnow()
                )
                line_statuses.append(line_status)
        
        nearby_station = NearbyStation(
            id=station_data['id'],
            name=station_data['name'],
            distance_meters=distance,
            walk_time_minutes=walk_time,
            lines=station_data['lines'],
            line_statuses=line_statuses
        )
        nearby.append(nearby_station)
    
    # Sort by distance
    return sorted(nearby, key=lambda x: x.distance_meters)[:5]

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
