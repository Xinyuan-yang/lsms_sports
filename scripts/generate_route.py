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
from firebase_admin import credentials, firestore


ORS_BASE_URL = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"
EARTH_RADIUS_KM = 6371.0


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
    """Fetch a walking route from OpenRouteService."""
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
    }
    response = requests.post(ORS_BASE_URL, headers=headers, json=payload, timeout=120)
    if not response.ok:
        print(f"OpenRouteService request failed: {response.status_code} {response.text}")
        sys.exit(1)
    return response.json()


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
    ors_data = fetch_ors_route(origin, destination, api_key)
    geometry = ors_data["features"][0]["geometry"]
    route = annotate_route(geometry)

    db.collection("config").document("global").update(
        {
            "routeGeoJson": route,
            "totalRouteKm": route["properties"]["totalDistanceKm"],
        }
    )

    print(f"Route stored. Total distance: {route['properties']['totalDistanceKm']} km")
    print(f"Number of waypoints: {len(geometry['coordinates'])}")


if __name__ == "__main__":
    main()
