from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.database import Base
import datetime

class Citation(Base):
    __tablename__ = "citations"
    
    id = Column(String, primary_key=True)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    location = Column(String, nullable=True)
    vehicle_type = Column(String, nullable=True)
    violation_type = Column(JSON, nullable=True)  # Store parsed list of violations
    police_station = Column(String, nullable=True, index=True)
    created_datetime = Column(DateTime, nullable=False, index=True)
    hour = Column(Integer, nullable=False)
    weekday = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    is_weekend = Column(Boolean, nullable=False)
    h3_grid_id = Column(String, nullable=False, index=True)

class AstramEvent(Base):
    __tablename__ = "astram_events"
    
    id = Column(String, primary_key=True)
    event_type = Column(String, nullable=False, index=True)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    address = Column(String, nullable=True)
    start_datetime = Column(DateTime, nullable=False, index=True)
    end_datetime = Column(DateTime, nullable=True)
    duration_minutes = Column(Float, nullable=True)
    police_station = Column(String, nullable=True, index=True)
    h3_grid_id = Column(String, nullable=False, index=True)

class RoadCache(Base):
    __tablename__ = "road_cache"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    h3_grid_id = Column(String, nullable=False, index=True, unique=True)
    road_class = Column(String, nullable=False)
    road_category = Column(String, nullable=False)
    is_one_way = Column(Boolean, nullable=False)
    is_service_road = Column(Boolean, nullable=False)
    nearest_junction_dist = Column(Float, nullable=False)
    last_updated = Column(DateTime, default=datetime.datetime.utcnow)

class Prediction(Base):
    __tablename__ = "predictions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    h3_grid_id = Column(String, nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    prediction_datetime = Column(DateTime, nullable=False, index=True)
    risk_score = Column(Float, nullable=False)
    impact_score = Column(Float, nullable=False)
    impact_severity = Column(String, nullable=False)  # Low, Medium, High, Critical
    monitoring_gap_alert = Column(Boolean, nullable=False)

class Deployment(Base):
    __tablename__ = "deployments"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    run_timestamp = Column(DateTime, default=datetime.datetime.utcnow, index=True)
    h3_grid_id = Column(String, nullable=False)
    location_name = Column(String, nullable=False)
    risk_score = Column(Float, nullable=False)
    impact_score = Column(Float, nullable=False)
    officers_allocated = Column(Integer, nullable=False)
    priority_score = Column(Float, nullable=False)
