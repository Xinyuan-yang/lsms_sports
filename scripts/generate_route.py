#!/usr/bin/env python3
"""Generate a walking route from origin to destination and store it in Firestore.

Uses the OpenRouteService Directions API (foot-walking profile).
Sign up for a free API key at https://openrouteservice.org/dev/#/signup.

Usage:
    export ORS_API_KEY=your_key_here
    .venv/bin/python scripts/generate_route.py
"""

import json
import math
import os
import sys
from pathlib import Path

import firebase_admin
import requests
import shapely
from firebase_admin import credentials, firestore
from shapely.geometry import LineString


ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"
ORS_MAX_SEGMENT_KM = 5000  # Stay safely under the 6000 km server limit
EARTH_RADIUS_KM = 6371.0

# Route is stored as a static JSON file in the Jekyll assets.
# Firestore only stores the path and total distance.
ROUTE_ASSET_PATH = Path(__file__).parent.parent / "assets" / "data" / "route.json"


def init_firebase():
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
    if not Path(cred_path).exists():
        print(f"Service account file not found: {cred_path}")
        sys.exit(1)

    cred = credentials.Certificate(cred_path)
    project_id = os.environ.get("FIREBASE_PROJECT_ID") or cred.project_id
    firebase_admin.initialize_app(cred, {"projectId": project_id})
    return firestore.client()


def fetch_ors_route(origin, destination, api_key):
    """Fetch a walking route between two points from OpenRouteService."""
    headers = {
        "Authorization": api_key,
        "Content-Type": "application/json",
    }
    payload = {
        "coordinates": [
            [origin["lng"], origin["lat"]],
            [destination["lng"], destination["lat"]],
        ],
        "instructions": False,
        "preference": "recommended",
        "radiuses": [-1, -1],
    }
    response = requests.post(ORS_BASE_URL, headers=headers, json=payload, timeout=120)
    if not response.ok:
        print(f"OpenRouteService request failed: {response.status_code} {response.text}")
        sys.exit(1)
    return response.json()


def haversine_km(p1, p2):
    """Haversine distance between two [lon, lat] points."""
    lon1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lon2, lat2 = math.radians(p2[0]), math.radians(p2[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def intermediate_point(p1, p2, fraction):
    """Return the point fraction of the way along the great-circle from p1 to p2."""
    lon1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lon2, lat2 = math.radians(p2[0]), math.radians(p2[1])

    d = 2 * math.asin(math.sqrt(
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    ))

    if abs(d) < 1e-12:
        return p1

    a = math.sin((1 - fraction) * d) / math.sin(d)
    b = math.sin(fraction * d) / math.sin(d)

    x = a * math.cos(lat1) * math.cos(lon1) + b * math.cos(lat2) * math.cos(lon2)
    y = a * math.cos(lat1) * math.sin(lon1) + b * math.cos(lat2) * math.sin(lon2)
    z = a * math.sin(lat1) + b * math.sin(lat2)

    lat = math.degrees(math.atan2(z, math.sqrt(x * x + y * y)))
    lon = math.degrees(math.atan2(y, x))
    return [lon, lat]


def split_waypoints(origin, destination, max_segment_km):
    """Split a long route into waypoints spaced <= max_segment_km apart (great-circle)."""
    total_km = haversine_km([origin["lng"], origin["lat"]], [destination["lng"], destination["lat"]])
    num_segments = max(1, math.ceil(total_km / max_segment_km))
    num_waypoints = num_segments + 1

    waypoints = []
    for i in range(num_waypoints):
        fraction = i / num_segments
        point = intermediate_point(
            [origin["lng"], origin["lat"]],
            [destination["lng"], destination["lat"]],
            fraction,
        )
        waypoints.append({"lng": point[0], "lat": point[1]})

    return waypoints


def fetch_multi_segment_route(origin, destination, api_key):
    """Fetch a route, automatically splitting it if it exceeds ORS limits."""
    total_great_circle = haversine_km(
        [origin["lng"], origin["lat"]],
        [destination["lng"], destination["lat"]],
    )

    if total_great_circle <= ORS_MAX_SEGMENT_KM:
        data = fetch_ors_route(origin, destination, api_key)
        return data["features"][0]["geometry"]

    print(f"Route is {total_great_circle:.0f} km; splitting into {ORS_MAX_SEGMENT_KM} km segments...")
    waypoints = split_waypoints(origin, destination, ORS_MAX_SEGMENT_KM)
    all_coordinates = []

    for i in range(len(waypoints) - 1):
        seg_origin = waypoints[i]
        seg_destination = waypoints[i + 1]
        print(f"  Segment {i + 1}/{len(waypoints) - 1}: routing {seg_origin['lat']:.3f},{seg_origin['lng']:.3f} -> {seg_destination['lat']:.3f},{seg_destination['lng']:.3f}")
        data = fetch_ors_route(seg_origin, seg_destination, api_key)
        coords = data["features"][0]["geometry"]["coordinates"]
        # Avoid duplicating the shared endpoint between segments.
        if i > 0:
            coords = coords[1:]
        all_coordinates.extend(coords)

    return {"type": "LineString", "coordinates": all_coordinates}


def simplify_geometry(geometry, tolerance_degrees=0.005):
    """Simplify a GeoJSON LineString while preserving topology.

    tolerance_degrees ≈ 0.005° corresponds to roughly 500 m near the equator.
    """
    line = LineString(geometry["coordinates"])
    simplified = line.simplify(tolerance=tolerance_degrees, preserve_topology=True)
    return {"type": "LineString", "coordinates": list(simplified.coords)}


def segment_distance_km(p1, p2):
    """Haversine distance between two [lon, lat] points."""
    lon1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lon2, lat2 = math.radians(p2[0]), math.radians(p2[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS_KM * c


def annotate_route(geometry):
    """Add cumulative distance to each coordinate for easier client-side rendering."""
    coordinates = geometry["coordinates"]
    cumulative = [0.0]
    for i in range(1, len(coordinates)):
        cumulative.append(cumulative[-1] + segment_distance_km(coordinates[i - 1], coordinates[i]))

    return {
        "type": "Feature",
        "properties": {
            "totalDistanceKm": round(cumulative[-1], 2),
            "coordinateDistancesKm": [round(d, 2) for d in cumulative],
        },
        "geometry": geometry,
    }


def main():
    api_key = os.environ.get("ORS_API_KEY")
    if not api_key:
        print("Please set the ORS_API_KEY environment variable.")
        print("Get a free key at https://openrouteservice.org/dev/#/signup")
        sys.exit(1)

    db = init_firebase()
    config_ref = db.collection("config").document("global").get()
    if not config_ref.exists:
        print("config/global not found. Run scripts/seed_config.py first.")
        sys.exit(1)

    config = config_ref.to_dict()
    origin = config["origin"]
    destination = config["destination"]

    print(f"Generating walking route from {origin['name']} to {destination['name']}...")
    geometry = fetch_multi_segment_route(origin, destination, api_key)
    print(f"  Raw waypoints: {len(geometry['coordinates'])}")
    geometry = simplify_geometry(geometry)
    print(f"  Simplified waypoints: {len(geometry['coordinates'])}")
    route = annotate_route(geometry)

    ROUTE_ASSET_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(ROUTE_ASSET_PATH, "w") as f:
        json.dump(route, f)

    # Store a reference in Firestore so the frontend knows where to fetch the route.
    db.collection("config").document("global").update(
        {
            "routeAssetPath": "/assets/data/route.json",
            "totalRouteKm": route["properties"]["totalDistanceKm"],
        }
    )

    print(f"Route saved to {ROUTE_ASSET_PATH}")
    print(f"Total distance: {route['properties']['totalDistanceKm']} km")
    print(f"Number of waypoints: {len(geometry['coordinates'])}")


if __name__ == "__main__":
    main()
