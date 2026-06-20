from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime

class PredictRequest(BaseModel):
    latitude: float
    longitude: float
    datetime_str: str  # Format: YYYY-MM-DD HH:MM:SS

class PredictResponse(BaseModel):
    h3_grid_id: str
    latitude: float
    longitude: float
    datetime_str: str
    risk_score: float
    road_class: str
    road_category: str

class ImpactRequest(BaseModel):
    risk_score: float
    road_class: str
    is_one_way: bool
    is_service_road: bool

class ImpactResponse(BaseModel):
    impact_score: float
    severity: str  # Low, Medium, High, Critical

class ValidationResponse(BaseModel):
    overlap_percentage: float
    validation_score: float
    confidence_level: str  # Low, Medium, High, Very High

class GapResponse(BaseModel):
    h3_grid_id: str
    latitude: float
    longitude: float
    predicted_risk: float
    citation_frequency: int
    alert: str  # e.g., "Coverage Gap Detected"

class AllocationRequest(BaseModel):
    available_officers: int = Field(default=20, ge=1)
    min_officers_per_zone: int = Field(default=1, ge=0)

class AllocationPayload(BaseModel):
    request: AllocationRequest
    predictions: List[Dict]

class OfficerAllocation(BaseModel):
    h3_grid_id: str
    latitude: float
    longitude: float
    location_name: str
    risk_score: float
    impact_score: float
    officers_allocated: int
    priority_score: float
    road_type: Optional[str] = None
    historical_density: Optional[int] = None
    monitoring_gap: Optional[str] = None
    allocation_reason: Optional[str] = None

class AllocationResponse(BaseModel):
    allocations: List[OfficerAllocation]
    total_allocated: int
    unallocated: int

class DashboardData(BaseModel):
    total_citations: int
    total_astram_incidents: int
    average_risk_score: float
    active_alerts_count: int
    all_predictions: List[Dict]  # All computed predictions for map display
    top_risk_zones: List[Dict]
    top_impact_zones: List[Dict]
    officer_allocations: List[Dict]
    gap_alerts: List[Dict]
    validation_metrics: Dict
