"""
Incident Intelligence Engine — Independent ASTraM-based scoring.

Produces an Incident Susceptibility Score (0-100) for each H3 grid cell
using DBSCAN spatial clustering, event-type weighting, and duration analysis.

This module is Theme 2's independent contribution to the hybrid architecture.
It runs separately from the parking-derived risk prediction engine.
"""

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func
from sklearn.cluster import DBSCAN

from app.models.database_models import AstramEvent


# Incident severity weights by event cause
# Unplanned events (breakdowns, waterlogging) cause more unpredictable disruption
EVENT_TYPE_WEIGHTS = {
    "unplanned": 1.5,   # Breakdowns, waterlogging, obstructions — higher disruption
    "planned": 0.8,     # Construction, maintenance — lower weight (predictable)
}

# Duration thresholds for severity scaling
DURATION_SEVERITY = {
    "short": (0, 30, 0.5),       # < 30 min → low severity multiplier
    "medium": (30, 120, 1.0),    # 30-120 min → baseline
    "long": (120, float('inf'), 1.8),  # > 2 hours → high severity
}


def _get_duration_multiplier(duration_minutes: float) -> float:
    """Map incident duration to a severity multiplier."""
    if duration_minutes is None or np.isnan(duration_minutes):
        return 1.0
    for _, (low, high, mult) in DURATION_SEVERITY.items():
        if low <= duration_minutes < high:
            return mult
    return 1.0


def compute_incident_scores(db: Session) -> dict:
    """
    Compute Incident Susceptibility Score (0-100) for every H3 grid cell
    that has ASTraM incident data.

    Pipeline:
    1. Fetch all ASTraM events with coordinates, event_type, duration
    2. Run DBSCAN spatial clustering to identify disruption corridors
    3. Weight events by type (unplanned > planned) and duration
    4. Aggregate weighted scores per H3 cell
    5. Normalize to 0-100 scale

    Returns:
        dict mapping h3_grid_id -> incident_susceptibility_score (float, 0-100)
    """
    # 1. Fetch all ASTraM events
    events = db.query(AstramEvent).all()
    if not events or len(events) < 5:
        return {}

    # Build dataframe
    records = []
    for e in events:
        records.append({
            "h3_grid_id": e.h3_grid_id,
            "latitude": e.latitude,
            "longitude": e.longitude,
            "event_type": e.event_type or "unplanned",
            "duration_minutes": e.duration_minutes or 60.0,
        })

    df = pd.DataFrame(records)

    # 2. DBSCAN spatial clustering
    # eps ~0.005 degrees ≈ 500m in Bengaluru, min_samples=3
    coords = df[["latitude", "longitude"]].values
    clustering = DBSCAN(eps=0.005, min_samples=3, metric="haversine", algorithm="ball_tree")

    # Convert to radians for haversine
    coords_rad = np.radians(coords)
    cluster_labels = clustering.fit_predict(coords_rad)
    df["cluster_id"] = cluster_labels

    # Events in a cluster get a density boost; noise points (label=-1) get baseline
    cluster_sizes = df[df["cluster_id"] != -1].groupby("cluster_id").size()

    def get_cluster_boost(row):
        cid = row["cluster_id"]
        if cid == -1:
            return 1.0  # Isolated event — no boost
        size = cluster_sizes.get(cid, 1)
        # Logarithmic boost: cluster of 10 → ~2.3x, cluster of 50 → ~3.9x
        return 1.0 + np.log1p(size) * 0.5

    df["cluster_boost"] = df.apply(get_cluster_boost, axis=1)

    # 3. Weight each event
    df["type_weight"] = df["event_type"].map(EVENT_TYPE_WEIGHTS).fillna(1.0)
    df["duration_weight"] = df["duration_minutes"].apply(_get_duration_multiplier)

    # Combined event score = type_weight × duration_weight × cluster_boost
    df["event_score"] = df["type_weight"] * df["duration_weight"] * df["cluster_boost"]

    # 4. Aggregate per H3 cell
    cell_scores = df.groupby("h3_grid_id").agg(
        total_score=("event_score", "sum"),
        event_count=("event_score", "count"),
        avg_duration=("duration_minutes", "mean"),
        unplanned_ratio=("event_type", lambda x: (x == "unplanned").mean()),
    ).reset_index()

    # 5. Normalize to 0-100
    # Use percentile-based normalization to spread scores realistically
    max_score = cell_scores["total_score"].quantile(0.95)  # Cap at 95th percentile
    if max_score == 0:
        max_score = 1.0

    cell_scores["incident_susceptibility_score"] = (
        (cell_scores["total_score"] / max_score) * 100.0
    ).clip(0.0, 100.0)

    # Build result dict
    result = {}
    for _, row in cell_scores.iterrows():
        result[row["h3_grid_id"]] = round(float(row["incident_susceptibility_score"]), 2)

    return result


def get_incident_score_for_cell(incident_scores: dict, h3_grid_id: str) -> float:
    """
    Look up the incident susceptibility score for a single H3 cell.
    Returns 0.0 if no incident data exists for that cell.
    """
    return incident_scores.get(h3_grid_id, 0.0)
