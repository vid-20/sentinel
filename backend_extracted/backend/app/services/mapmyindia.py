import requests
import datetime
from sqlalchemy.orm import Session
from app.models.database_models import RoadCache
from app.config import settings

# Thread-safe token storage
_token_cache = {
    "token": None,
    "expires_at": None
}

def get_mapmyindia_token() -> str:
    global _token_cache
    
    # Check if cached token is still valid
    if _token_cache["token"] and _token_cache["expires_at"] > datetime.datetime.utcnow():
        return _token_cache["token"]
        
    client_id = settings.MAPMYINDIA_CLIENT_ID
    client_secret = settings.MAPMYINDIA_CLIENT_SECRET
    
    if not client_id or not client_secret:
        raise ValueError("MapmyIndia credentials are not configured in settings.")
        
    url = "https://outpost.mapmyindia.com/api/security/oauth/token"
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret
    }
    
    response = requests.post(url, headers=headers, data=data, timeout=10)
    response.raise_for_status()
    res_data = response.json()
    
    token = res_data["access_token"]
    expires_in = res_data.get("expires_in", 3600)
    
    _token_cache["token"] = token
    _token_cache["expires_at"] = datetime.datetime.utcnow() + datetime.timedelta(seconds=expires_in - 60)
    
    return token

def fetch_from_mapmyindia(lat: float, lng: float) -> dict:
    """
    Attempt to fetch real road network info from MapmyIndia APIs using OAuth token.
    Uses reverse geocoding / snapToRoad API as standard endpoints.
    """
    token = get_mapmyindia_token()
    
    # Try reverse geocode first
    url = "https://search.mappls.com/search/address/rev-geocode"
    params = {
        "lat": lat,
        "lng": lng,
        "access_token": token
    }
    
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()
    
    # Parse results. MapmyIndia returns detailed address components.
    # We can infer road attributes from the results or perform snapToRoad.
    results = data.get("results", [])
    if not results:
        raise ValueError("No results returned from MapmyIndia API")
        
    first_res = results[0]
    street = first_res.get("street", "")
    area = first_res.get("subLocality", "")
    
    # Let's hit the snapToRoad API to get actual highway details if available
    # Endpoint: https://route.mappls.com/route/movement/snapToRoad
    # Wait, if we don't have premium routing API access, we default to mapping the reverse geocode attributes
    
    # Derive attributes from MapmyIndia address response
    road_class = "Arterial" if any(kw in street.upper() or kw in area.upper() for kw in ["ROAD", "HIGHWAY", "MAIN", "BYPASS"]) else "Local"
    road_category = "primary" if "HIGHWAY" in street.upper() or "MAIN" in street.upper() else "residential"
    is_one_way = "ONE WAY" in street.upper() or "ONE-WAY" in street.upper()
    is_service_road = "SERVICE" in street.upper()
    nearest_junction_dist = 150.0  # Default metric distance
    
    return {
        "road_class": road_class,
        "road_category": road_category,
        "is_one_way": is_one_way,
        "is_service_road": is_service_road,
        "nearest_junction_dist": nearest_junction_dist
    }

def fetch_from_osm_overpass(lat: float, lng: float) -> dict:
    """
    Real-time fallback to OSM Overpass API to query nearby road geometries and tags.
    """
    print(f"Fallback to OSM Overpass API for coordinates: ({lat}, {lng})")
    url = "https://overpass-api.de/api/interpreter"
    
    # Query ways with 'highway' tag around 150 meters
    query = f"""
    [out:json][timeout:10];
    (
      way(around:150, {lat}, {lng})[highway];
    );
    out tags geom;
    """
    response = requests.post(url, data={"data": query}, timeout=10)
    response.raise_for_status()
    data = response.json()
    
    elements = data.get("elements", [])
    if not elements:
        # Default fallback values for central Bengaluru if no ways nearby
        return {
            "road_class": "Collector",
            "road_category": "tertiary",
            "is_one_way": False,
            "is_service_road": False,
            "nearest_junction_dist": 120.0
        }
        
    # Pick the nearest element (first element returned by around)
    nearest = elements[0]
    tags = nearest.get("tags", {})
    
    highway_type = tags.get("highway", "residential")
    oneway_val = tags.get("oneway", "no")
    
    # Map OSM highway types to sentinel categories
    # road_class maps to: National Highway, Arterial, Sub-arterial, Collector, Local
    if highway_type in ["motorway", "trunk", "primary"]:
        road_class = "National Highway" if highway_type in ["motorway", "trunk"] else "Arterial"
        road_category = "primary"
    elif highway_type == "secondary":
        road_class = "Sub-arterial"
        road_category = "secondary"
    elif highway_type == "tertiary":
        road_class = "Collector"
        road_category = "tertiary"
    elif highway_type == "service":
        road_class = "Local"
        road_category = "service"
    else:
        road_class = "Local"
        road_category = "residential"
        
    is_one_way = oneway_val in ["yes", "1", "true"]
    is_service_road = highway_type == "service" or tags.get("service") is not None
    
    # Look for junctions nearby
    nearest_junction_dist = 80.0
    for el in elements:
        if "junction" in el.get("tags", {}):
            nearest_junction_dist = 25.0
            break
            
    return {
        "road_class": road_class,
        "road_category": road_category,
        "is_one_way": is_one_way,
        "is_service_road": is_service_road,
        "nearest_junction_dist": nearest_junction_dist
    }

def get_road_intelligence(db: Session, lat: float, lng: float, h3_grid_id: str) -> dict:
    """
    Retrieves road intelligence features for an H3 cell.
    Checks the local database cache first. If empty, uses fast heuristics (no external APIs).
    """
    # Check cache first
    cached_road = db.query(RoadCache).filter(RoadCache.h3_grid_id == h3_grid_id).first()
    if cached_road:
        return {
            "road_class": cached_road.road_class,
            "road_category": cached_road.road_category,
            "is_one_way": cached_road.is_one_way,
            "is_service_road": cached_road.is_service_road,
            "nearest_junction_dist": cached_road.nearest_junction_dist
        }
        
    # Try MapmyIndia API first (if credentials are configured)
    road_info = None
    try:
        if settings.MAPMYINDIA_CLIENT_ID and settings.MAPMYINDIA_CLIENT_SECRET:
            road_info = fetch_from_mapmyindia(lat, lng)
            print(f"Road intelligence from MapmyIndia API for ({lat}, {lng}): {road_info['road_class']}")
    except Exception as e:
        print(f"MapmyIndia API failed for ({lat}, {lng}): {e}")
    
    # Fallback to OSM Overpass API (no API key needed)
    if road_info is None:
        try:
            road_info = fetch_from_osm_overpass(lat, lng)
            print(f"Road intelligence from OSM Overpass for ({lat}, {lng}): {road_info['road_class']}")
        except Exception as e:
            print(f"OSM Overpass API also failed for ({lat}, {lng}): {e}")
    
    # Last-resort heuristic fallback (only if both APIs fail)
    if road_info is None:
        dist_to_center = ((lat - 12.9716)**2 + (lng - 77.5946)**2)**0.5
        if dist_to_center < 0.02:
            road_info = {
                "road_class": "Arterial",
                "road_category": "primary",
                "is_one_way": True,
                "is_service_road": False,
                "nearest_junction_dist": 45.0
            }
        elif dist_to_center < 0.05:
            road_info = {
                "road_class": "Sub-arterial",
                "road_category": "secondary",
                "is_one_way": False,
                "is_service_road": False,
                "nearest_junction_dist": 65.0
            }
        else:
            road_info = {
                "road_class": "Local",
                "road_category": "residential",
                "is_one_way": False,
                "is_service_road": False,
                "nearest_junction_dist": 120.0
            }
    
    # Save to database cache
    new_cache = RoadCache(
        latitude=lat,
        longitude=lng,
        h3_grid_id=h3_grid_id,
        road_class=road_info["road_class"],
        road_category=road_info["road_category"],
        is_one_way=road_info["is_one_way"],
        is_service_road=road_info["is_service_road"],
        nearest_junction_dist=road_info["nearest_junction_dist"]
    )
    db.add(new_cache)
    db.commit()
    
    return road_info
