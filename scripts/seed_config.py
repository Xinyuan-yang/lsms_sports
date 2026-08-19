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


def main():
    db = init_firebase()

    pin = generate_pin()
    config = {
        "origin": DEFAULT_ORIGIN,
        "destination": DEFAULT_DESTINATION,
        "groupPin": pin,
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
        },
        # Hiking reference: 5.5 METs at 4 km/h.
        "hikingMet": 5.5,
        "hikingSpeedKmh": 4.0,
    }

    db.collection("config").document("global").set(config)
    print("Config document created/updated at config/global")
    print(f"Group PIN (share with members): {pin}")
    print("Save this PIN somewhere safe — it is required to submit activities.")


if __name__ == "__main__":
    main()
