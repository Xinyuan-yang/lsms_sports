#!/usr/bin/env python3
"""Seed the Firestore config/global document.

Usage:
    .venv/bin/python scripts/seed_config.py

Requires:
    - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a Firebase service account JSON.
    - Or a service-account.json file in the repo root.
"""

import os
import secrets
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore


DEFAULT_ORIGIN = {
    "name": "EPFL, Switzerland",
    "lat": 46.5197,
    "lng": 6.5657,
}

DEFAULT_DESTINATION = {
    "name": "IIT Madras, India",
    "lat": 12.9915,
    "lng": 80.2336,
}


def init_firebase():
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
    if not Path(cred_path).exists():
        print(
            f"Service account file not found: {cred_path}\n"
            "Download one from Firebase Console → Project settings → Service accounts,\n"
            "rename it to service-account.json, and place it in the repo root."
        )
        sys.exit(1)

    cred = credentials.Certificate(cred_path)
    project_id = os.environ.get("FIREBASE_PROJECT_ID") or cred.project_id
    firebase_admin.initialize_app(cred, {"projectId": project_id})
    return firestore.client()


def generate_pin(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


DEFAULT_CONFIG = {
    "origin": DEFAULT_ORIGIN,
    "destination": DEFAULT_DESTINATION,
    # routeGeoJson and totalRouteKm will be filled by the route generator.
    "routeGeoJson": None,
    "totalRouteKm": None,
    "startDate": "2026-07-01",
    # MET lookup table used by the frontend when computing walking-equivalent km.
    "metValues": {
        "Jogging": 7.5,
        "Running": 9.0,
        "Bicycling": 7.0,
        "E-biking": 6.0,
        "Aerobics": 7.3,
        "Gym Exercise": 5.0,
        "Basketball": 8.0,
        "Cricket": 4.8,
        "Beach Volley": 8.0,
        "Football": 8.0,
        "Boxing": 9.3,
        "Climbing": 9.0,
        "Hiking": 5.5,
        "Tennis": 7.0,
        "Table tennis": 4.0,
            "Badminton": 8.0,
            "Skating": 7.0,
            "Skiing": 7.0,
            "Karting": 5.6,
            "Swimming": 7.0,
            "Volleyball": 8.0,
            "Landsailing": 4.0,
        },
    # Reference speeds (km/h) for distance-based sports at different paces.
    # Used by the frontend to convert entered distance back into time, then
    # apply the standard MET-based equivalence.
        "sportPaces": {
            "Bicycling": {"slow": 15, "medium": 20, "fast": 25},
            "E-biking": {"slow": 18, "medium": 22, "fast": 26},
            "Running": {"slow": 8, "medium": 10, "fast": 12},
            "Jogging": {"slow": 6, "medium": 7, "fast": 8},
            "Hiking": {"slow": 3, "medium": 4, "fast": 5},
        },
    "defaultPace": "medium",
    # Gradient colors for the weekly progress line on the map.
    # The color for each week is interpolated between slowColor (minimum weekly
    # km), midColor (middle), and fastColor (maximum weekly km).
    "weeklyPaceGradient": {
        "slowColor": "#f44336",
        "midColor": "#ffeb3b",
        "fastColor": "#4caf50",
    },
    # Hiking reference: 5.5 METs at 4 km/h.
    "hikingMet": 5.5,
    "hikingSpeedKmh": 4.0,
}


# Keys that are safe to overwrite with current defaults when re-seeding
# (schema/config values). All other existing keys, such as groupPin,
# totalRouteKm, routeAssetPath, origin, and destination, are preserved.
SCHEMA_KEYS = {"metValues", "sportPaces", "defaultPace", "weeklyPaceGradient", "hikingMet", "hikingSpeedKmh", "startDate"}


def main():
    db = init_firebase()

    config_ref = db.collection("config").document("global")
    existing = config_ref.get().to_dict() or {}

    # Start with defaults and overlay existing data, then re-apply schema updates.
    config = {**DEFAULT_CONFIG, **existing}
    for key in SCHEMA_KEYS:
        config[key] = DEFAULT_CONFIG[key]

    # Generate a PIN only for fresh projects.
    if "groupPin" not in config:
        config["groupPin"] = generate_pin()

    config_ref.set(config)
    print("Config document created/updated at config/global")
    print(f"Group PIN (share with members): {config['groupPin']}")
    print("Save this PIN somewhere safe — it is required to submit activities.")


if __name__ == "__main__":
    main()
