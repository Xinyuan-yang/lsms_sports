#!/usr/bin/env python3
"""Seed Firestore with test activity entries.

Usage:
    .venv/bin/python scripts/seed_test_entries.py

This is intended for local/branch testing only. Delete the test entries
before going live (see scripts/delete_test_entries.py).
"""

import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore


TEST_PEOPLE = ["Alice", "Bob", "Charlie", "Diana", "Evan"]
TEST_SPORTS = ["Running", "Tennis", "Swimming", "Cycling", "Hiking"]
TEST_DURATIONS = [30, 45, 60, 90]


def init_firebase():
    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "service-account.json")
    if not Path(cred_path).exists():
        print(
            f"Service account file not found: {cred_path}\n"
            "Download one from Firebase Console → Project settings → Service accounts."
        )
        sys.exit(1)

    cred = credentials.Certificate(cred_path)
    project_id = os.environ.get("FIREBASE_PROJECT_ID") or cred.project_id
    firebase_admin.initialize_app(cred, {"projectId": project_id})
    return firestore.client()


def compute_walking_km(duration_minutes: float, met_value: float, hiking_met: float, hiking_speed_kmh: float) -> float:
    """Convert MET-minutes to equivalent walking km."""
    hours = duration_minutes / 60.0
    equivalent_hours_walking = (met_value * hours) / hiking_met
    return round(equivalent_hours_walking * hiking_speed_kmh, 2)


def main():
    db = init_firebase()

    config_ref = db.collection("config").document("global").get()
    if not config_ref.exists:
        print("config/global not found. Run scripts/seed_config.py first.")
        sys.exit(1)

    config = config_ref.to_dict()
    group_pin = config["groupPin"]
    hiking_met = config.get("hikingMet", 5.5)
    hiking_speed = config.get("hikingSpeedKmh", 4.0)
    met_values = config.get("metValues", {})

    batch = db.batch()
    for i, person in enumerate(TEST_PEOPLE):
        sport = TEST_SPORTS[i % len(TEST_SPORTS)]
        duration = TEST_DURATIONS[i % len(TEST_DURATIONS)]
        met = met_values.get(sport, 6.0)
        walking_km = compute_walking_km(duration, met, hiking_met, hiking_speed)

        doc_ref = db.collection("entries").document(f"test-{secrets.token_hex(8)}")
        batch.set(
            doc_ref,
            {
                "person": person,
                "sport": sport,
                "durationMinutes": duration,
                "metValue": met,
                "walkingEquivalentKm": walking_km,
                "date": "2026-07-25",
                "submittedAt": datetime.now(timezone.utc),
                "pin": group_pin,
                "isTest": True,
            },
        )

    batch.commit()
    print(f"Seeded {len(TEST_PEOPLE)} test entries.")


if __name__ == "__main__":
    main()
