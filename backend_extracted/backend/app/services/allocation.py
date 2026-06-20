import pandas as pd
from sqlalchemy.orm import Session
from app.models.database_models import RoadCache

# Mapping H3 coordinates to familiar location names in Bengaluru for readable output
BENGALURU_LOCATIONS = [
    {"lat": 12.9716, "lng": 77.5946, "name": "MG Road"},
    {"lat": 12.9343, "lng": 77.6101, "name": "Koramangala"},
    {"lat": 12.9784, "lng": 77.6408, "name": "Indiranagar"},
    {"lat": 12.9822, "lng": 77.6083, "name": "Commercial Street"},
    {"lat": 12.9105, "lng": 77.6450, "name": "HSR Layout"},
    {"lat": 12.9592, "lng": 77.6974, "name": "Whitefield"},
    {"lat": 12.8450, "lng": 77.6633, "name": "Electronic City"},
    {"lat": 13.0358, "lng": 77.5970, "name": "Hebbal"},
    {"lat": 12.9226, "lng": 77.5933, "name": "Jayanagar"},
    {"lat": 13.0286, "lng": 77.5409, "name": "Peenya"}
]

def get_nearest_location_name(lat: float, lng: float) -> str:
    """
    Finds the closest named location in Bengaluru based on coordinates.
    """
    min_dist = float('inf')
    closest_name = "Bengaluru Sector"
    
    for loc in BENGALURU_LOCATIONS:
        dist = ((lat - loc["lat"])**2 + (lng - loc["lng"])**2)**0.5
        if dist < min_dist:
            min_dist = dist
            closest_name = loc["name"]
            
    # If distance is too far, return Sector coordinates
    if min_dist > 0.05:
        return f"Sector ({lat:.4f}, {lng:.4f})"
    return closest_name

def allocate_officers_dynamically(db: Session, predictions: list, available_officers: int = 20) -> dict:
    """
    Allocates available officers to zones to maximize congestion reduction.
    Inputs: predictions (containing risk_score, impact_score, monitoring_gap_alert)
    """
    if not predictions:
        return {"allocations": [], "total_allocated": 0, "unallocated": available_officers}
        
    # 1. Fetch road attributes to determine road importance
    # Cache H3 cell properties in memory for speed
    cached_roads = db.query(RoadCache).all()
    road_importance_map = {r.h3_grid_id: r.road_class for r in cached_roads}
    
    # Fetch citation counts for historical density
    from sqlalchemy import func
    from app.models.database_models import Citation
    citation_counts = db.query(
        Citation.h3_grid_id, 
        func.count(Citation.id).label("cnt")
    ).group_by(Citation.h3_grid_id).all()
    citations_map = {row[0]: row[1] for row in citation_counts}

    # 2. Compute Priority Score for each zone using the multi-factor formula
    candidate_zones = []
    for pred in predictions:
        h3_id = pred["h3_grid_id"]
        risk = pred["risk_score"]
        impact = pred["impact_score"]
        has_gap = pred.get("monitoring_gap_alert", False)
        lat = pred["latitude"]
        lng = pred["longitude"]
        
        # Get area importance based on road class
        road_class = road_importance_map.get(h3_id, "Local")
        if road_class in ["National Highway", "Arterial"]:
            road_importance_score = 100.0
        elif road_class == "Sub-arterial":
            road_importance_score = 80.0
        elif road_class == "Collector":
            road_importance_score = 60.0
        elif road_class == "Local":
            road_importance_score = 40.0
        else:
            road_importance_score = 20.0
            
        # Historical Citation Density
        citations = citations_map.get(h3_id, 0)
        citation_density_score = min(citations * 100.0 / 5000.0, 100.0)
        
        # Monitoring Gap Severity
        gap_severity_score = 100.0 if has_gap else 0.0
        
        # Incident Susceptibility Score (from Incident Intelligence Engine)
        incident_score = pred.get("incident_score", 0.0)
        
        # Priority Score formula (6-factor weighted model):
        # 0.30 * Risk + 0.20 * Impact + 0.15 * RoadImportance + 
        # 0.15 * IncidentScore + 0.10 * CitationDensity + 0.10 * GapSeverity
        priority_score = (
            (0.30 * risk) + 
            (0.20 * impact) + 
            (0.15 * road_importance_score) + 
            (0.15 * incident_score) +
            (0.10 * citation_density_score) + 
            (0.10 * gap_severity_score)
        )
        
        # Dynamic explanation reason generation
        gap_desc = "high" if (has_gap and risk >= 85) else ("medium" if has_gap else "none")
        
        if impact > risk and road_importance_score >= 80:
            allocation_reason = "Higher congestion impact and high road importance increased final priority score."
        elif has_gap:
            allocation_reason = "Active monitoring gap detected in this high-risk zone boosted patrol priority."
        elif road_importance_score >= 80:
            allocation_reason = "High road class priority (arterial/highway) increased allocation weight."
        elif impact > 60:
            allocation_reason = "High congestion impact severity drove officer deployment prioritization."
        else:
            allocation_reason = "Prioritized based on calibrated risk profile and baseline patrol coverage requirements."

        candidate_zones.append({
            "h3_grid_id": h3_id,
            "latitude": lat,
            "longitude": lng,
            "location_name": get_nearest_location_name(lat, lng),
            "risk_score": risk,
            "impact_score": impact,
            "priority_score": priority_score,
            "road_type": road_class,
            "historical_density": citations,
            "monitoring_gap": gap_desc,
            "allocation_reason": allocation_reason,
            "officers_allocated": 0
        })
        
    # Sort candidates by priority score descending
    candidate_zones.sort(key=lambda x: x["priority_score"], reverse=True)
    
    # 3. Dynamic Allocation (Proportional to priority score for top K locations)
    # Target top 8 high-priority zones for allocation to prevent spreading too thin
    top_k = min(len(candidate_zones), 8)
    if top_k == 0:
        return {"allocations": [], "total_allocated": 0, "unallocated": available_officers}
        
    alloc_candidates = candidate_zones[:top_k]
    total_priority = sum(z["priority_score"] for z in alloc_candidates)
    
    if total_priority == 0:
        total_priority = 1.0 # Avoid division by zero
        
    # Proportional raw assignment
    allocated_sum = 0
    for zone in alloc_candidates:
        raw_alloc = (zone["priority_score"] / total_priority) * available_officers
        zone["officers_allocated"] = int(round(raw_alloc))
        allocated_sum += zone["officers_allocated"]
        
    # 4. Adjustment step to guarantee exact matching with available_officers
    diff = available_officers - allocated_sum
    if diff > 0:
        # Give remaining to the highest-ranked zones
        for i in range(diff):
            alloc_candidates[i % len(alloc_candidates)]["officers_allocated"] += 1
    elif diff < 0:
        # Subtract from the lowest-ranked zones with non-zero allocation
        for i in reversed(range(len(alloc_candidates))):
            if diff == 0:
                break
            if alloc_candidates[i]["officers_allocated"] > 0:
                alloc_candidates[i]["officers_allocated"] -= 1
                diff += 1
                
    # Filter out locations with zero officers allocated
    final_allocations = [z for z in alloc_candidates if z["officers_allocated"] > 0]
    final_allocations.sort(key=lambda x: x["officers_allocated"], reverse=True)
    
    total_allocated = sum(z["officers_allocated"] for z in final_allocations)
    
    return {
        "allocations": final_allocations,
        "total_allocated": total_allocated,
        "unallocated": available_officers - total_allocated
    }
