from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.database_models import Citation

def detect_monitoring_gaps(db: Session, predictions: list) -> list:
    """
    Compares predicted risk with historical citation frequency.
    If predicted risk is high but historical enforcement is low, flags a monitoring gap.
    
    Returns continuous gap severity (0.0-1.0) instead of binary flags, enabling
    proportional resource allocation to under-monitored zones.
    """
    # 1. Fetch citation counts by H3 cell from DB
    citation_counts = db.query(
        Citation.h3_grid_id, 
        func.count(Citation.id).label("cnt")
    ).group_by(Citation.h3_grid_id).all()
    
    citations_map = {row[0]: row[1] for row in citation_counts}
    
    # Calculate descriptive statistics for dynamic thresholding
    counts = list(citations_map.values())
    if len(counts) > 0:
        counts_sorted = sorted(counts)
        # Use 75th percentile as the expected enforcement baseline
        # This makes most cells appear under-monitored relative to top-quartile enforcement
        p75_idx = int(len(counts_sorted) * 0.75)
        expected_enforcement = float(counts_sorted[p75_idx])
        # 20th percentile defines "low enforcement"
        p20_idx = int(len(counts_sorted) * 0.20)
        low_enforcement_threshold = float(counts_sorted[p20_idx]) if p20_idx < len(counts_sorted) else 50.0
    else:
        expected_enforcement = 500.0
        low_enforcement_threshold = 50.0
    
    # Ensure minimum floor for threshold
    low_enforcement_threshold = max(low_enforcement_threshold, 50.0)
    
    alerts = []
    for pred in predictions:
        h3_id = pred["h3_grid_id"]
        risk = pred["risk_score"]
        citations = citations_map.get(h3_id, 0)
        
        # Coverage ratio: how much enforcement exists relative to expected
        coverage_ratio = min(citations / expected_enforcement, 1.0) if expected_enforcement > 0 else 0.0
        
        # Gap severity: inverse of coverage, scaled by risk
        # High risk + low coverage = high gap severity
        # Low risk = low gap severity regardless of coverage
        risk_factor = max(0.0, (risk - 25.0)) / 75.0  # Normalized risk above 25%
        gap_severity = risk_factor * (1.0 - coverage_ratio)
        gap_severity = min(max(gap_severity, 0.0), 1.0)
        
        # Flag zones with gap severity above detection threshold
        if gap_severity >= 0.15:
            alerts.append({
                "h3_grid_id": h3_id,
                "latitude": pred["latitude"],
                "longitude": pred["longitude"],
                "predicted_risk": float(round(risk, 2)),
                "citation_frequency": citations,
                "expected_enforcement": int(expected_enforcement),
                "coverage_ratio": float(round(coverage_ratio, 3)),
                "gap_severity": float(round(gap_severity, 3)),
                "threshold": low_enforcement_threshold,
                "alert": f"Coverage Gap Detected: Risk {int(risk)}% with {int(coverage_ratio*100)}% expected enforcement coverage."
            })
            
    # Sort alerts by gap severity (highest first)
    alerts.sort(key=lambda x: x["gap_severity"], reverse=True)
    return alerts
