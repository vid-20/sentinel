import pandas as pd
import numpy as np
import os
import json
import datetime
from sqlalchemy.orm import Session
from app.database import engine, SessionLocal
from app.models.database_models import Citation, AstramEvent
from app.config import settings

def get_h3_index(lat, lng, resolution=8):
    try:
        import h3
        # Compatible with both H3 v3 and v4 API
        if hasattr(h3, 'latlng_to_cell'):
            return h3.latlng_to_cell(lat, lng, resolution)
        else:
            return h3.geo_to_h3(lat, lng, resolution)
    except Exception:
        # Fallback to a default cell in central Bengaluru if anything fails
        return "88618925d3fffff"

def clean_citations(file_path: str) -> pd.DataFrame:
    print(f"Cleaning citations dataset: {file_path}")
    # Load columns of interest
    cols = ['id', 'latitude', 'longitude', 'location', 'vehicle_type', 'violation_type', 'police_station', 'created_datetime']
    df = pd.read_csv(file_path, usecols=cols)
    
    # Remove duplicates and nulls in key spatial/temporal columns
    df = df.dropna(subset=['id', 'latitude', 'longitude', 'created_datetime'])
    df = df.drop_duplicates(subset=['id'])
    
    # Bounding box filter for Bengaluru
    df = df[(df['latitude'] >= 12.80) & (df['latitude'] <= 13.15)]
    df = df[(df['longitude'] >= 77.40) & (df['longitude'] <= 77.80)]
    
    # Convert dates and extract temporal features
    df['created_datetime'] = pd.to_datetime(df['created_datetime'], errors='coerce')
    df = df.dropna(subset=['created_datetime'])
    
    df['hour'] = df['created_datetime'].dt.hour
    df['weekday'] = df['created_datetime'].dt.weekday
    df['month'] = df['created_datetime'].dt.month
    df['is_weekend'] = df['weekday'] >= 5
    
    # Safe JSON parse for violation_type
    def parse_violation_type(x):
        if pd.isna(x):
            return ["UNKNOWN"]
        if isinstance(x, str):
            try:
                # In case it is double encoded or contains lists as string
                val = json.loads(x)
                if isinstance(val, list):
                    return val
                return [str(val)]
            except:
                # Remove quotes/brackets manually if malformed JSON
                clean_str = x.replace('[', '').replace(']', '').replace('"', '').strip()
                return [s.strip() for s in clean_str.split(',') if s.strip()]
        return [str(x)]

    df['violation_type'] = df['violation_type'].apply(parse_violation_type)
    
    # Calculate H3 Grid IDs
    df['h3_grid_id'] = df.apply(lambda row: get_h3_index(row['latitude'], row['longitude']), axis=1)
    
    return df

def clean_astram(file_path: str) -> pd.DataFrame:
    print(f"Cleaning ASTraM dataset: {file_path}")
    cols = ['id', 'event_type', 'latitude', 'longitude', 'address', 'start_datetime', 'end_datetime', 'police_station']
    df = pd.read_csv(file_path, usecols=cols)
    
    df = df.dropna(subset=['id', 'latitude', 'longitude', 'start_datetime'])
    df = df.drop_duplicates(subset=['id'])
    
    # Bounding box filter for Bengaluru
    df = df[(df['latitude'] >= 12.80) & (df['latitude'] <= 13.15)]
    df = df[(df['longitude'] >= 77.40) & (df['longitude'] <= 77.80)]
    
    # Parse datetimes
    df['start_datetime'] = pd.to_datetime(df['start_datetime'], errors='coerce')
    df['end_datetime'] = pd.to_datetime(df['end_datetime'], errors='coerce')
    df = df.dropna(subset=['start_datetime'])
    
    # Calculate duration (fallback to 60 min if missing)
    def calc_duration(row):
        if pd.isna(row['end_datetime']):
            return 60.0
        duration = (row['end_datetime'] - row['start_datetime']).total_seconds() / 60.0
        return max(duration, 5.0)  # Min 5 mins
        
    df['duration_minutes'] = df.apply(calc_duration, axis=1)
    
    # Calculate H3 Grid IDs
    df['h3_grid_id'] = df.apply(lambda row: get_h3_index(row['latitude'], row['longitude']), axis=1)
    
    return df

def import_datasets_to_db(db: Session, citations_csv: str, astram_csv: str):
    # Process and load citations
    cit_df = clean_citations(citations_csv)
    
    # Delete existing to prevent primary key duplicates if reloading
    db.query(Citation).delete()
    db.commit()
    
    # Insert in chunks using sqlalchemy Core for speed
    print("Writing citations to database...")
    citation_records = cit_df.to_dict(orient='records')
    # Sanitize NaT/NaN values for DB compatibility
    for r in citation_records:
        for k, v in r.items():
            if isinstance(v, list):
                continue
            if pd.isna(v):
                r[k] = None
                
    db.bulk_insert_mappings(Citation, citation_records)
    db.commit()
    print(f"Successfully loaded {len(citation_records)} citations.")
    
    # Process and load ASTraM events
    ast_df = clean_astram(astram_csv)
    
    db.query(AstramEvent).delete()
    db.commit()
    
    print("Writing ASTraM events to database...")
    astram_records = ast_df.to_dict(orient='records')
    # Sanitize NaT/NaN values for DB compatibility
    for r in astram_records:
        for k, v in r.items():
            if isinstance(v, list):
                continue
            if pd.isna(v):
                r[k] = None
                
    db.bulk_insert_mappings(AstramEvent, astram_records)
    db.commit()
    print(f"Successfully loaded {len(astram_records)} ASTraM events.")
    
    return len(citation_records), len(astram_records)
