"""
Congestion Impact Engine — Hybrid impact estimation.

Congestion Impact Score combines parking-derived impact estimates with
recurring incident susceptibility, allowing both parking behavior and
traffic disturbances to influence deployment decisions.

Formula:
    base_impact = (risk_score × road_importance × capacity_reduction) / 1.2
    impact_score = 0.8 × base_impact + 0.2 × incident_score
"""


def calculate_congestion_impact(
    risk_score: float,
    road_class: str,
    is_one_way: bool,
    is_service_road: bool,
    incident_score: float = 0.0
) -> dict:
    """
    Calculate congestion impact by combining parking risk with road characteristics
    and incident susceptibility.

    Args:
        risk_score: Parking risk score (0-100) from XGBoost model
        road_class: Road hierarchy classification (National Highway, Arterial, etc.)
        is_one_way: Whether the road segment is one-way
        is_service_road: Whether this is a service/slip road
        incident_score: Incident Susceptibility Score (0-100) from incident engine

    Returns:
        dict with impact_score, severity, and component breakdowns
    """
    # 1. Road Importance Weighting
    if road_class in ["National Highway", "Arterial"]:
        road_importance = 1.5
    elif road_class == "Sub-arterial":
        road_importance = 1.3
    elif road_class == "Collector":
        road_importance = 1.2
    else:  # Local / Residential / Others
        road_importance = 0.8

    # 2. Capacity Reduction Factor (estimated parking obstruction)
    if is_service_road:
        capacity_reduction = 0.8  # high capacity reduction on narrow service roads
    elif is_one_way:
        capacity_reduction = 0.6  # medium capacity reduction on one-way flow
    else:  # Standard 2-way road
        capacity_reduction = 0.4  # lower capacity reduction on standard 2-way flow

    # 3. Hybrid Impact Formula
    # Base impact preserves the existing transportation-aware scoring
    base_impact = (risk_score * road_importance * capacity_reduction) / 1.2

    # Final impact blends parking-derived base with incident susceptibility
    # 80% parking intelligence + 20% incident intelligence
    impact_score = (0.8 * base_impact) + (0.2 * incident_score)

    # Bound to [0, 100]
    impact_score = min(max(impact_score, 0.0), 100.0)

    # 4. Severity Classification
    if impact_score >= 75.0:
        severity = "Critical"
    elif impact_score >= 50.0:
        severity = "High"
    elif impact_score >= 25.0:
        severity = "Medium"
    else:
        severity = "Low"

    return {
        "impact_score": float(round(impact_score, 2)),
        "severity": severity,
        "road_importance": road_importance,
        "capacity_reduction": capacity_reduction,
        "base_impact": float(round(base_impact, 2)),
        "incident_contribution": float(round(0.2 * incident_score, 2))
    }
